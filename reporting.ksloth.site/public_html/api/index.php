<?php
declare(strict_types=1);

require __DIR__ . '/db.php'; // sets $pdo, session_start(), CORS headers, getDateRange()

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$basePath = '/api';
if (strpos($path, $basePath) === 0) {
    $path = substr($path, strlen($basePath));
}
$segments = array_values(array_filter(explode('/', $path), fn($s) => $s !== ''));

$resource = $segments[0] ?? null;
$id = $segments[1] ?? null;

if ($resource === null) {
    sendErrorResponse(404, 'No resource specified');
}

// Auth endpoints are always reachable — you can't require a login to
// reach the login endpoint.
$authResources = ['login', 'logout', 'me'];
if (in_array($resource, $authResources, true)) {
    require __DIR__ . "/routes/{$resource}.php";
    exit;
}

// Everything past this point is the real security boundary — this is
// what actually blocks unauthenticated access, not any redirect logic
// on the frontend.
if (empty($_SESSION['user'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

// users needs its own handler (password hashing, hiding password_hash,
// admin-only role check) rather than the generic CRUD allow-list.
if ($resource === 'users') {
    require __DIR__ . '/routes/users.php';
    exit;
}

// "GET with no ID" on these four resource names returns the aggregate
// report instead of raw rows (see earlier design note).
$reportResources = ['overview', 'activity', 'pageviews', 'performance', 'errors', 'sessions', 'bounce-report'];

if (in_array($resource, $reportResources, true) && $id === null) {
    if ($method !== 'GET') {
        http_response_code(405);
        header('Allow: GET');
        echo json_encode(['error' => 'This endpoint only supports GET (no ID = aggregate report)']);
        exit;
    }
    require __DIR__ . "/routes/{$resource}.php";
    exit;
}

require __DIR__ . '/routes/crud.php';
