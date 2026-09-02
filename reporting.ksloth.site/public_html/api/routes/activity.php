<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    $topPagesStmt = $pdo->prepare(
        "SELECT url, COUNT(*) AS views
         FROM pageviews
         WHERE type = 'pageview' AND server_timestamp BETWEEN :start AND :end
         GROUP BY url
         ORDER BY views DESC"
    );
    $topPagesStmt->execute([':start' => $start, ':end' => $end]);
    $topPages = $topPagesStmt->fetchAll(PDO::FETCH_ASSOC);

    // Entry referrer per session — avoids double-counting internal
    // page-to-page navigation as if it were an external referrer.
    $referrerStmt = $pdo->prepare(
        "SELECT
            CASE WHEN referrer IS NULL OR referrer = '' THEN 'Direct' ELSE referrer END AS referrer,
            COUNT(*) AS sessions
         FROM sessions
         WHERE start_time BETWEEN :start AND :end
         GROUP BY referrer
         ORDER BY sessions DESC
         LIMIT 10"
    );
    $referrerStmt->execute([':start' => $start, ':end' => $end]);
    $referrers = $referrerStmt->fetchAll(PDO::FETCH_ASSOC);

    $jsStmt = $pdo->prepare(
        "SELECT SUM(js_allowed = 1) AS js_true, COUNT(*) AS total
         FROM pageviews
         WHERE type = 'pageview' AND server_timestamp BETWEEN :start AND :end"
    );
    $jsStmt->execute([':start' => $start, ':end' => $end]);
    $jsRow = $jsStmt->fetch(PDO::FETCH_ASSOC);
    $jsAllowedPct = ((int) $jsRow['total']) > 0
        ? round(((int) $jsRow['js_true'] / (int) $jsRow['total']) * 100, 1)
        : 0;

    echo json_encode([
        'range'        => ['start' => $start, 'end' => $end],
        'topPages'     => $topPages,
        'referrers'    => $referrers,
        'jsAllowedPct' => $jsAllowedPct,
    ]);
} catch (Throwable $e) {
    error_log('[api activity] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
