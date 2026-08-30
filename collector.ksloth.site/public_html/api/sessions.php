<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    $byDayStmt = $pdo->prepare(
        "SELECT DATE(start_time) AS day, COUNT(*) AS sessions
         FROM sessions
         WHERE start_time BETWEEN :start AND :end
         GROUP BY DATE(start_time)
         ORDER BY day ASC"
    );
    $byDayStmt->execute([':start' => $start, ':end' => $end]);

    $statsStmt = $pdo->prepare(
        "SELECT
            COUNT(*) AS total_sessions,
            ROUND(AVG(duration_seconds), 2) AS avg_duration_seconds,
            ROUND(AVG(page_count), 2) AS avg_pages_per_session,
            ROUND((SUM(CASE WHEN page_count = 1 THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) AS bounce_rate_pct
         FROM sessions
         WHERE start_time BETWEEN :start AND :end"
    );
    $statsStmt->execute([':start' => $start, ':end' => $end]);

    echo json_encode([
        'range' => ['start' => $start, 'end' => $end],
        'byDay' => $byDayStmt->fetchAll(PDO::FETCH_ASSOC),
        'stats' => $statsStmt->fetch(PDO::FETCH_ASSOC),
    ]);
} catch (Throwable $e) {
    error_log('[api sessions] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
