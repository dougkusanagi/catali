<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $file = $request->file('image');
        if (! $file || ! $file->isValid()) {
            return response()->json(['error' => 'Selecione uma imagem.'], 400);
        }

        if (($file->getSize() ?: 0) > 10 * 1024 * 1024) {
            return response()->json(['error' => 'Use JPG, PNG ou WebP com até 10 MB.'], 400);
        }

        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        ];
        $mime = $file->getMimeType();
        if (! isset($extensions[$mime])) {
            return response()->json(['error' => 'Use JPG, PNG ou WebP com até 10 MB.'], 400);
        }

        $directory = storage_path('uploads');
        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $filename = Str::random(32).'.'.$extensions[$mime];
        $file->move($directory, $filename);

        return response()->json(['path' => '/uploads/'.$filename], 201);
    }
}
