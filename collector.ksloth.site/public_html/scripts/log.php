<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST required']);
    exit;
}

$raw = file_get_contents('php://input');

if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Empty request']);
    exit;
}

$data = json_decode($raw, true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Only accept the fields you actually want.
$record = [
    'url'       => $data['url'] ?? '',
    'title'     => $data['title'] ?? '',
    'referrer'  => $data['referrer'] ?? '',
    'timestamp' => $data['timestamp'] ?? '',
    'type'      => $data['type'] ?? ''
];

// Store one JSON object per line.
$logFile = __DIR__ . '/analytics.log';

file_put_contents(
    $logFile,
    json_encode($record, JSON_UNESCAPED_SLASHES) . PHP_EOL,
    FILE_APPEND | LOCK_EX
);

http_response_code(201);
exit;