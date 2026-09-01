<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    $byDayStmt = $pdo->prepare(
        "SELECT DATE(server_timestamp) AS day, COUNT(*) AS count
         FROM pageviews
         WHERE type = 'pageview' AND server_timestamp BETWEEN :start AND :end
         GROUP BY DATE(server_timestamp)
         ORDER BY day ASC"
    );
    $byDayStmt->execute([':start' => $start, ':end' => $end]);

    $topPagesStmt = $pdo->prepare(
        "SELECT url, COUNT(*) AS views
         FROM pageviews
         WHERE type = 'pageview' AND server_timestamp BETWEEN :start AND :end
         GROUP BY url
         ORDER BY views DESC
         LIMIT 20"
    );
    $topPagesStmt->execute([':start' => $start, ':end' => $end]);

    echo json_encode([
        'range'    => ['start' => $start, 'end' => $end],
        'byDay'    => $byDayStmt->fetchAll(PDO::FETCH_ASSOC),
        'topPages' => $topPagesStmt->fetchAll(PDO::FETCH_ASSOC),
    ]);
} catch (Throwable $e) {
    error_log('[api pageviews] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
