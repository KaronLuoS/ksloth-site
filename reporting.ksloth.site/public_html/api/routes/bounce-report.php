<?php
declare(strict_types=1);

[$start, $end] = getDateRange();

try {
    // 1. Bucket each session by its own average load time, then compare
    // bounce rate (page_count == 1) across buckets — the report's core question.
    $bucketStmt = $pdo->prepare(
        "SELECT
            CASE
                WHEN avg_load < 1000 THEN '<1s'
                WHEN avg_load < 2000 THEN '1-2s'
                WHEN avg_load < 3000 THEN '2-3s'
                ELSE '3s+'
            END AS bucket,
            MIN(avg_load) AS bucket_sort,
            COUNT(*) AS sessions,
            ROUND(AVG(page_count = 1) * 100, 1) AS bounce_rate_pct
         FROM (
            SELECT s.session_id, s.page_count, AVG(p.load_time) AS avg_load
            FROM sessions s
            JOIN performance p ON p.session_id = s.session_id
            WHERE s.start_time BETWEEN :start AND :end
            GROUP BY s.session_id, s.page_count
         ) t
         GROUP BY bucket
         ORDER BY bucket_sort"
    );
    $bucketStmt->execute([':start' => $start, ':end' => $end]);
    $loadTimeBuckets = $bucketStmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. Load time by page, split by browser family (parsed from UA).
    $browserCase = "
        CASE
            WHEN s.user_agent LIKE '%Chrome%' AND s.user_agent NOT LIKE '%Edg%' THEN 'Chrome'
            WHEN s.user_agent LIKE '%Firefox%' THEN 'Firefox'
            WHEN s.user_agent LIKE '%Safari%' AND s.user_agent NOT LIKE '%Chrome%' THEN 'Safari'
            WHEN s.user_agent LIKE '%Trident%' OR s.user_agent LIKE '%MSIE%' THEN 'Legacy/IE'
            ELSE 'Other'
        END";
    $pageStmt = $pdo->prepare(
        "SELECT p.url, {$browserCase} AS browser, ROUND(AVG(p.load_time), 2) AS avg_load_time, COUNT(*) AS samples
         FROM performance p
         JOIN sessions s ON s.session_id = p.session_id
         WHERE p.server_timestamp BETWEEN :start AND :end
         GROUP BY p.url, browser
         ORDER BY p.url, avg_load_time DESC"
    );
    $pageStmt->execute([':start' => $start, ':end' => $end]);
    $byPageBrowser = $pageStmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. IP "region" (derived from prefix — see generate_seed_data.php)
    // vs average load time.
    $regionCase = "
        CASE
            WHEN pv.client_ip LIKE '73.%' THEN 'US West'
            WHEN pv.client_ip LIKE '98.%' THEN 'US East'
            WHEN pv.client_ip LIKE '82.%' THEN 'Europe'
            WHEN pv.client_ip LIKE '103.%' THEN 'Asia'
            ELSE 'Other/Intl'
        END";
    $regionStmt = $pdo->prepare(
        "SELECT {$regionCase} AS region, ROUND(AVG(p.load_time), 2) AS avg_load_time, COUNT(DISTINCT pv.session_id) AS sessions
         FROM pageviews pv
         JOIN performance p ON p.session_id = pv.session_id AND p.url = pv.url
         WHERE pv.server_timestamp BETWEEN :start AND :end
         GROUP BY region
         ORDER BY avg_load_time DESC"
    );
    $regionStmt->execute([':start' => $start, ':end' => $end]);
    $ipRegions = $regionStmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'range'          => ['start' => $start, 'end' => $end],
        'loadTimeBuckets'=> $loadTimeBuckets,
        'byPageBrowser'  => $byPageBrowser,
        'ipRegions'      => $ipRegions,
    ]);
} catch (Throwable $e) {
    error_log('[api bounce-report] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}