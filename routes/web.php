<?php

use Illuminate\Support\Facades\Route;

Route::get('/uploads/{filename}', function (string $filename) {
    $path = storage_path('uploads/'.basename($filename));

    abort_unless(is_file($path), 404);

    return response()->file($path);
})->where('filename', '[A-Za-z0-9._-]+');

Route::get('/up', fn () => response()->json(['status' => 'ok']));

Route::get('/{any?}', function () {
    $index = public_path('index.html');

    if (is_file($index)) {
        return response()->file($index);
    }

    return response()->json(['error' => 'Frontend ainda não compilado.'], 503);
})->where('any', '^(?!api|uploads|up).*$');
