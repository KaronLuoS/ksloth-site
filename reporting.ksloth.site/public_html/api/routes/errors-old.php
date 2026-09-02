<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    $freqStmt = $pdo->prepare(
        "SELECT error_message, COUNT(*) AS occurrences, MAX(server_timestamp) AS last_seen
         FROM errors
         WHERE server_timestamp BETWEEN :start AND :end
         GROUP BY error_message
         ORDER BY occurrences DESC
         LIMIT 20"
    );
    $freqStmt->execute([':start' => $start, ':end' => $end]);

    $trendStmt = $pdo->prepare(
        "SELECT DATE(server_timestamp) AS day, COUNT(*) AS count
         FROM errors
         WHERE server_timestamp BETWEEN :start AND :end
         GROUP BY DATE(server_timestamp)
         ORDER BY day ASC"
    );
    $trendStmt->execute([':start' => $start, ':end' => $end]);

    echo json_encode([
        'range'     => ['start' => $start, 'end' => $end],
        'frequency' => $freqStmt->fetchAll(PDO::FETCH_ASSOC),
        'trend'     => $trendStmt->fetchAll(PDO::FETCH_ASSOC),
    ]);
} catch (Throwable $e) {
    error_log('[api errors] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
