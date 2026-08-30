<?php
declare(strict_types=1);

// Allow-list: resource name in the URL -> real table, primary key
// column, and which columns POST/PUT are allowed to write. Table
// names and columns NEVER come from user input directly — only from
// this map — so there's no SQL injection surface via the resource name.
$resourceMap = [
    'pageviews' => [
        'table'   => 'pageviews',
        'pk'      => 'id',
        'columns' => ['url', 'type', 'cookies_enabled', 'js_allowed', 'images_allowed',
                      'css_allowed', 'user_agent', 'viewport_width', 'viewport_height',
                      'referrer', 'client_timestamp', 'server_timestamp', 'client_ip',
                      'session_id', 'payload'],
    ],
    'events' => [
        'table'   => 'events',
        'pk'      => 'id',
        'columns' => ['session_id', 'event_name', 'event_category', 'event_data', 'url', 'server_timestamp'],
    ],
    'errors' => [
        'table'   => 'errors',
        'pk'      => 'id',
        'columns' => ['session_id', 'error_message', 'error_source', 'error_line',
                      'error_column', 'stack_trace', 'url', 'user_agent', 'server_timestamp'],
    ],
    'performance' => [
        'table'   => 'performance',
        'pk'      => 'id',
        'columns' => ['session_id', 'url', 'ttfb', 'dom_content_loaded', 'dom_complete', 'load_time', 'server_timestamp'],
    ],
    'sessions' => [
        'table'   => 'sessions',
        'pk'      => 'id', // surrogate id, after the gap-based sessionization migration
        'columns' => ['session_id', 'first_page', 'last_page', 'page_count', 'start_time',
                      'last_activity', 'duration_seconds', 'referrer', 'user_agent'],
    ],
];

if (!isset($resourceMap[$resource])) {
    http_response_code(404);
    echo json_encode(['error' => "Unknown resource: {$resource}"]);
    exit;
}

$meta = $resourceMap[$resource];
$table = $meta['table'];
$pk = $meta['pk'];
$allowedColumns = $meta['columns'];

try {
    switch ($method) {
        case 'GET':
            if ($id !== null) {
                $stmt = $pdo->prepare("SELECT * FROM {$table} WHERE {$pk} = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                    exit;
                }
                echo json_encode($row);
            } else {
                // Capped + paginated — these are logging tables, "all rows" is unbounded.
                $limit = min((int) ($_GET['limit'] ?? 100), 500);
                $offset = max((int) ($_GET['offset'] ?? 0), 0);
                $stmt = $pdo->prepare("SELECT * FROM {$table} ORDER BY {$pk} DESC LIMIT ? OFFSET ?");
                $stmt->bindValue(1, $limit, PDO::PARAM_INT);
                $stmt->bindValue(2, $offset, PDO::PARAM_INT);
                $stmt->execute();
                echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            }
            break;

        case 'POST':
            if ($id !== null) {
                http_response_code(400);
                echo json_encode(['error' => 'Do not include an ID in POST requests']);
                exit;
            }
            $body = json_decode(file_get_contents('php://input'), true);
            if (!is_array($body)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid JSON body']);
                exit;
            }
            $fields = array_intersect_key($body, array_flip($allowedColumns));
            if (empty($fields)) {
                http_response_code(400);
                echo json_encode(['error' => 'No valid fields provided']);
                exit;
            }

            $params = [];
            foreach ($fields as $col => $val) {
                $params[":{$col}"] = $val;
            }
            $cols = array_keys($fields);
            $placeholders = array_map(fn($c) => ":{$c}", $cols);

            $sql = "INSERT INTO {$table} (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $placeholders) . ")";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            http_response_code(201);
            echo json_encode([$pk => $pdo->lastInsertId()] + $fields);
            break;

        case 'PUT':
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'An ID is required for PUT requests']);
                exit;
            }
            $body = json_decode(file_get_contents('php://input'), true);
            if (!is_array($body)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid JSON body']);
                exit;
            }
            $fields = array_intersect_key($body, array_flip($allowedColumns));
            if (empty($fields)) {
                http_response_code(400);
                echo json_encode(['error' => 'No valid fields provided']);
                exit;
            }

            $setParts = [];
            $params = [];
            foreach ($fields as $col => $val) {
                $setParts[] = "{$col} = :{$col}";
                $params[":{$col}"] = $val;
            }
            $params[':__id'] = $id;

            $sql = "UPDATE {$table} SET " . implode(', ', $setParts) . " WHERE {$pk} = :__id";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if ($stmt->rowCount() === 0) {
                $check = $pdo->prepare("SELECT 1 FROM {$table} WHERE {$pk} = ?");
                $check->execute([$id]);
                if (!$check->fetch()) {
                    http_response_code(404);
                    echo json_encode(['error' => 'Not found']);
                    exit;
                }
                // else: row exists, values were just already identical — fine.
            }
            echo json_encode(['updated' => true, $pk => $id] + $fields);
            break;

        case 'DELETE':
            if ($id === null) {
                http_response_code(400);
                echo json_encode(['error' => 'An ID is required for DELETE requests']);
                exit;
            }
            $stmt = $pdo->prepare("DELETE FROM {$table} WHERE {$pk} = ?");
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                exit;
            }
            echo json_encode(['deleted' => true, $pk => $id]);
            break;

        default:
            http_response_code(405);
            header('Allow: GET, POST, PUT, DELETE');
            echo json_encode(['error' => 'Method not allowed']);
    }
} catch (Throwable $e) {
    error_log('[api crud] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
