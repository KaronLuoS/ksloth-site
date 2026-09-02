<?php
declare(strict_types=1);

$config = require dirname(__DIR__, 3) . '/var/www/collector.ksloth.site/database/config.php';

// ── Session (must start before any output) ─────────────────────────
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', '1');  
ini_set('session.cookie_samesite', 'Lax'); // use 'None' instead if login page/dashboard end up on a different origin than /api
session_start();

// ── CORS ──────────────────────────────────────────────────────────
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedConfig = $config['allowed_origin'];

if (is_array($allowedConfig)) {
    $originToSend = in_array($requestOrigin, $allowedConfig, true)
        ? $requestOrigin
        : $allowedConfig[0];
} else {
    $originToSend = (string) $allowedConfig;
}

header('Access-Control-Allow-Origin: ' . $originToSend);
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

function getPdo(): PDO
{
    global $config;
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $config['db_host'],
            $config['db_name'],
            $config['db_charset']
        );
        $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
    }

    return $pdo;
}

/**
 * Reads ?start=&end= from the query string (any format strtotime()
 * understands), defaulting to the last 30 days if missing/invalid.
 * Every report endpoint uses this so date filtering is consistent.
 */
function getDateRange(): array
{
    $start = $_GET['start'] ?? null;
    $end = $_GET['end'] ?? null;

    if (!$start || !strtotime($start)) {
        $start = date('Y-m-d H:i:s', strtotime('-30 days'));
    } else {
        $start = date('Y-m-d H:i:s', strtotime($start));
    }

    if (!$end || !strtotime($end)) {
        $end = date('Y-m-d H:i:s');
    } else {
        $end = date('Y-m-d H:i:s', strtotime($end));
    }

    return [$start, $end];
}

$pdo = getPdo();
