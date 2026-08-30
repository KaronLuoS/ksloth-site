<?php
declare(strict_types=1);

// ADJUST THIS PATH to wherever config.php actually lives relative to
// this reporting vhost's document root — same issue we debugged for
// the collector's log.php. Reuses the same config.php (DB creds +
// allowed_origin) if it's shared across both vhosts; otherwise point
// this at a copy scoped to the reporting vhost.
$config = require dirname(__DIR__, 2) . '/database/config.php';

// ── CORS ──────────────────────────────────────────────────────────
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedConfig = $config['allowed_origin'];

if (is_array($allowedConfig)) {
    $originToSend = in_array($requestOrigin, $allowedConfig, true)
        ? $requestOrigin
        : $allowedConfig[0];
} else {
    $originToSend = (string) $allowedConfig;
}

header('Access-Control-Allow-Origin: ' . $originToSend);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

function getPdo(): PDO
{
    global $config;
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $config['db_host'],
            $config['db_name'],
            $config['db_charset']
        );
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }

    return $pdo;
}

/**
 * Reads ?start=&end= from the query string (any format strtotime()
 * understands), defaulting to the last 30 days if missing/invalid.
 * Every report endpoint uses this so date filtering is consistent.
 */
function getDateRange(): array
{
    $start = $_GET['start'] ?? null;
    $end = $_GET['end'] ?? null;

    if (!$start || !strtotime($start)) {
        $start = date('Y-m-d H:i:s', strtotime('-30 days'));
    } else {
        $start = date('Y-m-d H:i:s', strtotime($start));
    }

    if (!$end || !strtotime($end)) {
        $end = date('Y-m-d H:i:s');
    } else {
        $end = date('Y-m-d H:i:s', strtotime($end));
    }

    return [$start, $end];
}

$pdo = getPdo();
