<?php
declare(strict_types=1);

// POST only, per the tutorial: logout changes server state (destroys a
// session), so GET is wrong here — a GET-based logout can be triggered
// by a plain <img src="/api/logout"> on any page (CSRF).
if ($method !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$_SESSION = [];
session_destroy();

echo json_encode(['success' => true]);
