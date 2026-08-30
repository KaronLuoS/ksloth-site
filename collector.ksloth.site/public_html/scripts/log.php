<?php
/**
 * log.php
 * Receives beacon payloads from collector.js and routes them into:
 * sessions, pageviews, events, errors, performance.
 */

declare(strict_types=1);

$config = require dirname(__DIR__, 2) . '/database/config.php';;

// ── CORS ──────────────────────────────────────────────────────────

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedConfig = $config['allowed_origin'];

if (is_array($allowedConfig)) {
    $originToSend = in_array($requestOrigin, $allowedConfig, true)
        ? $requestOrigin
        : $allowedConfig[0]; // fallback so the header is never missing/invalid
} else {
    $originToSend = (string) $allowedConfig;
}

header('Access-Control-Allow-Origin: ' . $originToSend);
header('Access-Control-Allow-Credentials: true'); // required: sendBeacon() always sends credentials cross-origin
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST, OPTIONS');
    exit;
}

// ── Read & validate the body ────────────────────────────────────────

$raw = file_get_contents('php://input');

if ($raw === false || $raw === '') {
    http_response_code(400);
    exit;
}

if (strlen($raw) > $config['max_payload_bytes']) {
    http_response_code(413);
    exit;
}

$payload = json_decode($raw, true);

if (!is_array($payload)) {
    http_response_code(400);
    exit;
}

$type      = isset($payload['type']) ? (string) $payload['type'] : 'unknown';
$sessionId = isset($payload['session']) ? mb_substr((string) $payload['session'], 0, 36) : '';
$url       = isset($payload['url']) ? mb_substr((string) $payload['url'], 0, 2048) : '';
$referrer  = isset($payload['referrer']) ? mb_substr((string) $payload['referrer'], 0, 2048) : '';
$clientTs  = isset($payload['timestamp']) ? (string) $payload['timestamp'] : null;
$tech      = $payload['technographics'] ?? [];

// Prefer the technographics-reported UA (client-side); fall back to the
// request header (works even for beacon types that don't carry technographics).
$headerUserAgent = isset($_SERVER['HTTP_USER_AGENT']) ? mb_substr($_SERVER['HTTP_USER_AGENT'], 0, 512) : null;
$userAgent = isset($tech['userAgent']) ? mb_substr((string) $tech['userAgent'], 0, 512) : $headerUserAgent;

$ip = $_SERVER['REMOTE_ADDR'] ?? null;

if ($sessionId === '') {
    http_response_code(400);
    exit;
}

// buildPayload() sends timestamp as an ISO 8601 string
// (new Date().toISOString()), but pageviews.client_timestamp /
// wherever else needs it is BIGINT (epoch milliseconds) — convert here.
function isoToEpochMs(?string $iso): ?int
{
    if (!$iso) return null;
    try {
        $dt = new DateTime($iso);
        return (int) round(((float) $dt->format('U.u')) * 1000);
    } catch (Throwable $e) {
        return null;
    }
}

$clientTimestampMs = isoToEpochMs($clientTs);
$nowSql = (new DateTime())->format('Y-m-d H:i:s');

function classifyEventType(string $activityType): string
{
    $map = [
        'mousemove'  => 'mouse',
        'click'      => 'mouse',
        'scroll'     => 'scroll',
        'keydown'    => 'keyboard',
        'keyup'      => 'keyboard',
        'idle-break' => 'idle',
        'lifecycle'  => 'lifecycle',
    ];
    return $map[$activityType] ?? 'custom';
}

/**
 * Map a raw errorData object (from js-error / resource-error /
 * promise-rejection) onto the errors table's columns.
 */
function mapErrorFields(array $error): array
{
    $type = $error['type'] ?? '';
    if ($type === 'resource-error') {
        return [
            'message' => 'Resource failed to load: ' . ($error['tagName'] ?? 'unknown'),
            'source'  => $error['src'] ?? null,
            'line'    => null,
            'column'  => null,
            'stack'   => null,
        ];
    }
    return [
        'message' => $error['message'] ?? null,
        'source'  => $error['source'] ?? null,
        'line'    => isset($error['line']) ? (int) $error['line'] : null,
        'column'  => isset($error['column']) ? (int) $error['column'] : null,
        'stack'   => $error['stack'] ?? null,
    ];
}

try {
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $config['db_host'],
        $config['db_name'],
        $config['db_charset']
    );

    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $pdo->beginTransaction();

    // ── 1. Upsert the session row (one per session_id) ────────────
    $isPageview = ($type === 'pageview');

    $stmt = $pdo->prepare(
        'INSERT INTO sessions
            (session_id, first_page, last_page, page_count, start_time, last_activity, duration_seconds, referrer, user_agent)
         VALUES
            (:session_id, :url, :url, :page_count, :now, :now2, 0, :referrer, :user_agent)
         ON DUPLICATE KEY UPDATE
            last_page = IF(:is_pageview = 1, VALUES(last_page), last_page),
            page_count = page_count + :increment,
            last_activity = VALUES(last_activity),
            duration_seconds = TIMESTAMPDIFF(SECOND, start_time, VALUES(last_activity))'
    );
    $stmt->execute([
        ':session_id'  => $sessionId,
        ':url'         => $url,
        ':page_count'  => $isPageview ? 1 : 0,
        ':now'         => $nowSql,
        ':now2'        => $nowSql,
        ':referrer'    => $referrer,
        ':user_agent'  => $userAgent,
        ':is_pageview' => $isPageview ? 1 : 0,
        ':increment'   => $isPageview ? 1 : 0,
    ]);

    // ── 2. Route into the type-specific table ────────────────────

    if ($type === 'pageview') {
        $toBool = static function ($v) {
            return $v === null ? null : (bool) $v;
        };

        $stmt = $pdo->prepare(
            'INSERT INTO pageviews
                (url, type, cookies_enabled, js_allowed, images_allowed, css_allowed,
                 user_agent, viewport_width, viewport_height, referrer,
                 client_timestamp, server_timestamp, client_ip, session_id, payload)
             VALUES
                (:url, :type, :cookies_enabled, :js_allowed, :images_allowed, :css_allowed,
                 :user_agent, :vw, :vh, :referrer,
                 :client_ts, :server_ts, :ip, :session_id, :payload)'
        );
        $stmt->execute([
            ':url'             => $url,
            ':type'            => $type,
            ':cookies_enabled' => $toBool($tech['cookiesEnabled'] ?? null),
            ':js_allowed'      => $toBool($tech['jsAllowed'] ?? null),
            ':images_allowed'  => $toBool($tech['imagesAllowed'] ?? null), // may be NULL if unresolved yet
            ':css_allowed'     => $toBool($tech['cssAllowed'] ?? null),
            ':user_agent'      => $userAgent,
            ':vw'              => isset($tech['viewportWidth']) ? (int) $tech['viewportWidth'] : null,
            ':vh'              => isset($tech['viewportHeight']) ? (int) $tech['viewportHeight'] : null,
            ':referrer'        => $referrer,
            ':client_ts'       => $clientTimestampMs,
            ':server_ts'       => $nowSql,
            ':ip'              => $ip,
            ':session_id'      => $sessionId,
            ':payload'         => $raw,
        ]);

        $timing = $payload['timing'] ?? null;
        if (is_array($timing)) {
            $t = $timing['timingObject'] ?? [];
            $ttfb = (isset($t['responseStart'], $t['requestStart']))
                ? round($t['responseStart'] - $t['requestStart'], 2) : null;
            $domContentLoaded = (isset($t['domContentLoadedEventEnd'], $t['fetchStart']))
                ? round($t['domContentLoadedEventEnd'] - $t['fetchStart'], 2) : null;
            $domComplete = (isset($t['domComplete'], $t['fetchStart']))
                ? round($t['domComplete'] - $t['fetchStart'], 2) : null;
            $loadTime = isset($timing['loadEvent']) ? round((float) $timing['loadEvent'], 2) : null;

            $stmt = $pdo->prepare(
                'INSERT INTO performance
                    (session_id, url, ttfb, dom_content_loaded, dom_complete, load_time, server_timestamp)
                 VALUES
                    (:session_id, :url, :ttfb, :dcl, :dom_complete, :load_time, :server_ts)'
            );
            $stmt->execute([
                ':session_id'   => $sessionId,
                ':url'          => $url,
                ':ttfb'         => $ttfb,
                ':dcl'          => $domContentLoaded,
                ':dom_complete' => $domComplete,
                ':load_time'    => $loadTime,
                ':server_ts'    => $nowSql,
            ]);
        }
    } elseif ($type === 'error') {
        $error = $payload['error'] ?? [];
        $mapped = mapErrorFields($error);

        $stmt = $pdo->prepare(
            'INSERT INTO errors
                (session_id, error_message, error_source, error_line, error_column, stack_trace, url, user_agent, server_timestamp)
             VALUES
                (:session_id, :message, :source, :line, :column, :stack, :url, :user_agent, :server_ts)'
        );
        $stmt->execute([
            ':session_id' => $sessionId,
            ':message'    => $mapped['message'] !== null ? mb_substr((string) $mapped['message'], 0, 1024) : null,
            ':source'     => $mapped['source'] !== null ? mb_substr((string) $mapped['source'], 0, 2048) : null,
            ':line'       => $mapped['line'],
            ':column'     => $mapped['column'],
            ':stack'      => $mapped['stack'],
            ':url'        => $url,
            ':user_agent' => $userAgent,
            ':server_ts'  => $nowSql,
        ]);
    } elseif ($type === 'activity') {
        $activity = $payload['activity'] ?? [];
        $activityType = isset($activity['type']) ? (string) $activity['type'] : 'unknown';

        $stmt = $pdo->prepare(
            'INSERT INTO events
                (session_id, event_name, event_category, event_data, url, server_timestamp)
             VALUES
                (:session_id, :name, :category, :data, :url, :server_ts)'
        );
        $stmt->execute([
            ':session_id' => $sessionId,
            ':name'       => mb_substr($activityType, 0, 128),
            ':category'   => classifyEventType($activityType),
            ':data'       => json_encode($activity),
            ':url'        => $url,
            ':server_ts'  => $nowSql,
        ]);
    } elseif ($type === 'technographics-update') {
        // Late-resolved images-allowed correction — patch the most
        // recent pageview for this session instead of losing it.
        $imagesAllowed = $payload['data']['imagesAllowed'] ?? null;
        if ($imagesAllowed !== null) {
            $stmt = $pdo->prepare(
                'UPDATE pageviews SET images_allowed = :val
                 WHERE session_id = :session_id
                 ORDER BY id DESC LIMIT 1'
            );
            $stmt->execute([
                ':val'        => (bool) $imagesAllowed,
                ':session_id' => $sessionId,
            ]);
        }
    } else {
        // Custom collector.track(eventName, data) calls
        $stmt = $pdo->prepare(
            'INSERT INTO events
                (session_id, event_name, event_category, event_data, url, server_timestamp)
             VALUES
                (:session_id, :name, "custom", :data, :url, :server_ts)'
        );
        $stmt->execute([
            ':session_id' => $sessionId,
            ':name'       => mb_substr($type, 0, 128),
            ':data'       => json_encode($payload['data'] ?? $payload),
            ':url'        => $url,
            ':server_ts'  => $nowSql,
        ]);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[collector log.php] ' . $e->getMessage());
    http_response_code(204);
    exit;
}

http_response_code(204);
