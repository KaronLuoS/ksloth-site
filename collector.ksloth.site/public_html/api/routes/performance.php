<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    // NOTE: avg_lcp / avg_cls are always null — the collector currently
    // only gathers Navigation Timing (ttfb, load_time), not Core Web
    // Vitals. The columns are included here so the frontend doesn't
    // need a special case once that data exists later.
    $stmt = $pdo->prepare(
        "SELECT
            url,
            ROUND(AVG(load_time), 2) AS avg_load_time,
            ROUND(AVG(ttfb), 2) AS avg_ttfb,
            NULL AS avg_lcp,
            NULL AS avg_cls,
            COUNT(*) AS samples
         FROM performance
         WHERE server_timestamp BETWEEN :start AND :end
         GROUP BY url
         ORDER BY avg_load_time DESC
         LIMIT 20"
    );
    $stmt->execute([':start' => $start, ':end' => $end]);

    echo json_encode([
        'range' => ['start' => $start, 'end' => $end],
        'pages' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        'note'  => 'avg_lcp and avg_cls are not yet collected by collector.js.',
    ]);
} catch (Throwable $e) {
    error_log('[api performance] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
