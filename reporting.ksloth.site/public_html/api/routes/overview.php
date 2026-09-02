<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    $pageviewsStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM pageviews WHERE type = 'pageview' AND server_timestamp BETWEEN :start AND :end"
    );
    $pageviewsStmt->execute([':start' => $start, ':end' => $end]);
    $totalPageviews = (int) $pageviewsStmt->fetchColumn();

    $sessionsStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM sessions WHERE start_time BETWEEN :start AND :end"
    );
    $sessionsStmt->execute([':start' => $start, ':end' => $end]);
    $totalSessions = (int) $sessionsStmt->fetchColumn();

    $perfStmt = $pdo->prepare(
        "SELECT AVG(load_time) FROM performance WHERE server_timestamp BETWEEN :start AND :end"
    );
    $perfStmt->execute([':start' => $start, ':end' => $end]);
    $avgLoad = $perfStmt->fetchColumn();

    $errorsStmt = $pdo->prepare(
        "SELECT COUNT(*) FROM errors WHERE server_timestamp BETWEEN :start AND :end"
    );
    $errorsStmt->execute([':start' => $start, ':end' => $end]);
    $totalErrors = (int) $errorsStmt->fetchColumn();

    echo json_encode([
        'range'             => ['start' => $start, 'end' => $end],
        'total_pageviews'   => $totalPageviews,
        'total_sessions'    => $totalSessions,
        'avg_load_time_ms'  => $avgLoad !== null ? round((float) $avgLoad, 2) : 0,
        'total_errors'      => $totalErrors,
    ]);
} catch (Throwable $e) {
    error_log('[api overview] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
