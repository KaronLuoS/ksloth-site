<?php
declare(strict_types=1);

if ($method !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$email = trim($body['email'] ?? '');
$password = $body['password'] ?? '';

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email and password required']);
    exit;
}

try {
    $stmt = $pdo->prepare('SELECT id, email, password_hash, display_name, role FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);


    if (!$user || !password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
        exit;
    }

    // New session ID on login — prevents session fixation.
    session_regenerate_id(true);

    $_SESSION['user'] = [
        'id'          => $user['id'],
        'email'       => $user['email'],
        'displayName' => $user['display_name'],
        'role'        => $user['role'],
        'password_hash'    => $user['password_hash'],
    ];

    $pdo->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);

    echo json_encode(['success' => true, 'data' => $_SESSION['user']]);
} catch (Throwable $e) {
    error_log('[api login] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Internal server error']);
}
