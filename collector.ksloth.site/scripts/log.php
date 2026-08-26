<?php

file_put_contents(
    __DIR__ . '/debug.log',
    date('c') . ' METHOD=' . $_SERVER['REQUEST_METHOD'] . PHP_EOL,
    FILE_APPEND
);

http_response_code(204);