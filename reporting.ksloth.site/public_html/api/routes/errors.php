<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    $totalStmt = $pdo->prepare("SELECT COUNT(*) FROM errors WHERE server_timestamp BETWEEN :start AND :end");
    $totalStmt->execute([':start' => $start, ':end' => $end]);
    $total = (int) $totalStmt->fetchColumn();

    // Type derived from message prefix — matches the templates the
    // seed generator (and your real collector) actually produces.
    $typeStmt = $pdo->prepare(
        "SELECT
            CASE
                WHEN error_message LIKE 'TypeError%' THEN 'TypeError'
                WHEN error_message LIKE 'ReferenceError%' THEN 'ReferenceError'
                WHEN error_message LIKE 'SyntaxError%' THEN 'SyntaxError'
                WHEN error_message LIKE 'RangeError%' THEN 'RangeError'
                WHEN error_message LIKE 'Resource failed to load%' THEN 'Resource Error'
                WHEN error_message LIKE 'promise-rejection%' THEN 'Promise Rejection'
                ELSE 'Other'
            END AS error_type,
            COUNT(*) AS count
         FROM errors
         WHERE server_timestamp BETWEEN :start AND :end
         GROUP BY error_type
         ORDER BY count DESC"
    );
    $typeStmt->execute([':start' => $start, ':end' => $end]);
    $byType = $typeStmt->fetchAll(PDO::FETCH_ASSOC);

    // Errors per session, bucketed 0/1/2/3+. Sessions with zero errors
    // never appear in the errors table at all, so this starts from
    // `sessions` and left-counts errors per session.
    $perSessionStmt = $pdo->prepare(
        "SELECT error_count, COUNT(*) AS sessions FROM (
            SELECT s.session_id,
                (SELECT COUNT(*) FROM errors e
                 WHERE e.session_id = s.session_id
                   AND e.server_timestamp BETWEEN :start AND :end) AS error_count
            FROM sessions s
            WHERE s.start_time BETWEEN :start2 AND :end2
         ) t
         GROUP BY error_count"
    );
    $perSessionStmt->execute([':start' => $start, ':end' => $end, ':start2' => $start, ':end2' => $end]);
    $rawHistogram = $perSessionStmt->fetchAll(PDO::FETCH_ASSOC);

    $buckets = ['0' => 0, '1' => 0, '2' => 0, '3+' => 0];
    foreach ($rawHistogram as $row) {
        $c = (int) $row['error_count'];
        $key = $c >= 3 ? '3+' : (string) $c;
        $buckets[$key] += (int) $row['sessions'];
    }

    $freqStmt = $pdo->prepare(
        "SELECT error_message, COUNT(*) AS occurrences, MAX(server_timestamp) AS last_seen
         FROM errors
         WHERE server_timestamp BETWEEN :start AND :end
         GROUP BY error_message
         ORDER BY occurrences DESC
         LIMIT 20"
    );
    $freqStmt->execute([':start' => $start, ':end' => $end]);
    $frequency = $freqStmt->fetchAll(PDO::FETCH_ASSOC);

    $trendStmt = $pdo->prepare(
        "SELECT DATE(server_timestamp) AS day, COUNT(*) AS count
         FROM errors
         WHERE server_timestamp BETWEEN :start AND :end
         GROUP BY DATE(server_timestamp)
         ORDER BY day ASC"
    );
    $trendStmt->execute([':start' => $start, ':end' => $end]);
    $trend = $trendStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'range'               => ['start' => $start, 'end' => $end],
        'total'               => $total,
        'byType'              => $byType,
        'perSessionHistogram' => $buckets,
        'frequency'           => $frequency,
        'trend'               => $trend,
    ]);
} catch (Throwable $e) {
    error_log('[api errors] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
