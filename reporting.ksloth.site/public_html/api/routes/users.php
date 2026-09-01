<?php
declare(strict_types=1);

// Only owner/admin can manage accounts. index.php already guaranteed
// $_SESSION['user'] exists before routing here.
if (!in_array($_SESSION['user']['role'], ['owner', 'admin'], true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden — admin access required']);
    exit;
}

$validRoles = ['owner', 'admin', 'viewer'];

// password_hash is intentionally never selected/returned below.
switch ($method) {
    case 'GET':
        if ($id !== null) {
            $stmt = $pdo->prepare('SELECT id, email, display_name, role, created_at, last_login FROM users WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                exit;
            }
            echo json_encode($row);
        } else {
            $stmt = $pdo->query('SELECT id, email, display_name, role, created_at, last_login FROM users ORDER BY id DESC');
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
        }
        break;

    case 'POST':
        if ($id !== null) {
            http_response_code(400);
            echo json_encode(['error' => 'Do not include an ID in POST requests']);
            exit;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';
        $displayName = trim($body['displayName'] ?? '');
        $role = $body['role'] ?? 'viewer';

        if ($email === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['error' => 'email and password are required']);
            exit;
        }
        if (strlen($password) < 8) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 8 characters']);
            exit;
        }
        if (!in_array($role, $validRoles, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'role must be one of: ' . implode(', ', $validRoles)]);
            exit;
        }

        try {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare(
                'INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
            );
            $stmt->execute([$email, $hash, $displayName ?: null, $role]);

            http_response_code(201);
            echo json_encode([
                'id'          => (int) $pdo->lastInsertId(),
                'email'       => $email,
                'displayName' => $displayName,
                'role'        => $role,
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') { // UNIQUE constraint on email
                http_response_code(409);
                echo json_encode(['error' => 'A user with that email already exists']);
            } else {
                error_log('[api users] ' . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => 'Internal server error']);
            }
        }
        break;

    case 'PUT':
        if ($id === null) {
            http_response_code(400);
            echo json_encode(['error' => 'An ID is required for PUT requests']);
            exit;
        }

        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $setParts = [];
        $params = [':id' => $id];

        if (isset($body['displayName'])) {
            $setParts[] = 'display_name = :display_name';
            $params[':display_name'] = $body['displayName'];
        }
        if (isset($body['role'])) {
            if (!in_array($body['role'], $validRoles, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'role must be one of: ' . implode(', ', $validRoles)]);
                exit;
            }
            $setParts[] = 'role = :role';
            $params[':role'] = $body['role'];
        }
        if (!empty($body['password'])) {
            if (strlen($body['password']) < 8) {
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 8 characters']);
                exit;
            }
            $setParts[] = 'password_hash = :password_hash';
            $params[':password_hash'] = password_hash($body['password'], PASSWORD_DEFAULT);
        }

        if (empty($setParts)) {
            http_response_code(400);
            echo json_encode(['error' => 'No valid fields provided']);
            exit;
        }

        $sql = 'UPDATE users SET ' . implode(', ', $setParts) . ' WHERE id = :id';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            $check = $pdo->prepare('SELECT 1 FROM users WHERE id = ?');
            $check->execute([$id]);
            if (!$check->fetch()) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                exit;
            }
        }
        echo json_encode(['updated' => true, 'id' => (int) $id]);
        break;

    case 'DELETE':
        if ($id === null) {
            http_response_code(400);
            echo json_encode(['error' => 'An ID is required for DELETE requests']);
            exit;
        }
        // Don't let an admin lock themselves out mid-session.
        if ((int) $id === (int) $_SESSION['user']['id']) {
            http_response_code(400);
            echo json_encode(['error' => "You can't delete your own account while logged in as it"]);
            exit;
        }
        $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Not found']);
            exit;
        }
        echo json_encode(['deleted' => true, 'id' => (int) $id]);
        break;

    default:
        http_response_code(405);
        header('Allow: GET, POST, PUT, DELETE');
        echo json_encode(['error' => 'Method not allowed']);
}
