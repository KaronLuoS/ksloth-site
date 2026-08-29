<?php
/**
 * config.php
 * Settings for the collector endpoint (log.php).
 */

return [
    'db_host'    => 'localhost',
    'db_name'    => 'collector_db',
    'db_user'    => 'collector_user',
    'db_pass'    => 'YouShallNotPass!UnlessUare1collector',
    'db_charset' => 'utf8mb4',

    'allowed_origin' => ['https://www.ksloth.site',
    'https://www.collector.ksloth.site',
    'https://www.reporting.ksloth.site',
    'https://www.test.ksloth.site',
    'https://ksloth.site',
    'https://collector.ksloth.site',
    'https://reporting.ksloth.site',
    'https://test.ksloth.site',],

    // Reject any beacon body bigger than this (bytes). Keeps a broken
    // or malicious client from writing unbounded data.
    'max_payload_bytes' => 65536,
];