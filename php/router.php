<?php

declare(strict_types=1);

const PHP_PROJECT_ROOT = __DIR__ . "/..";
$path = parse_url($_SERVER["REQUEST_URI"] ?? "/", PHP_URL_PATH) ?: "/";

if (str_starts_with($path, "/api/")) {
    require PHP_PROJECT_ROOT . "/php/index.php";
    return;
}

if (str_starts_with($path, "/uploads/")) {
    $filename = basename($path);
    $file = PHP_PROJECT_ROOT . "/storage/uploads/" . $filename;
    if (!is_file($file)) {
        http_response_code(404);
        return;
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file) ?: "application/octet-stream";
    header("Content-Type: {$mime}");
    readfile($file);
    return;
}

$relativePath = ltrim($path, "/");
$staticFile = PHP_PROJECT_ROOT . "/dist/" . $relativePath;
if ($relativePath !== "" && is_file($staticFile)) {
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($staticFile) ?: "application/octet-stream";
    header("Content-Type: {$mime}");
    readfile($staticFile);
    return;
}

$index = PHP_PROJECT_ROOT . "/dist/index.html";
if (!is_file($index)) {
    http_response_code(503);
    echo "Execute o build do frontend antes de iniciar o PHP.";
    return;
}
header("Content-Type: text/html; charset=utf-8");
readfile($index);
