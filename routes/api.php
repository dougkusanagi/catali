<?php

use App\Http\Controllers\PromotionController;
use App\Http\Controllers\StoreController;
use App\Http\Controllers\UploadController;
use Illuminate\Support\Facades\Route;

Route::get('/store', [StoreController::class, 'show']);
Route::put('/store', [StoreController::class, 'update']);

Route::get('/promotions', [PromotionController::class, 'index']);
Route::post('/promotions', [PromotionController::class, 'store']);
Route::get('/promotions/{promotion}/history', [PromotionController::class, 'history']);
Route::get('/promotions/{promotion}/exports', [PromotionController::class, 'exports']);
Route::post('/promotions/{promotion}/duplicate', [PromotionController::class, 'duplicate']);
Route::patch('/promotions/{promotion}/status', [PromotionController::class, 'status']);
Route::get('/promotions/{promotion}/pdf', [PromotionController::class, 'pdf']);
Route::get('/promotions/{promotion}/exports/jpg', [PromotionController::class, 'jpg']);
Route::get('/promotions/{promotion}/exports/cover', [PromotionController::class, 'cover']);
Route::get('/promotions/{promotion}', [PromotionController::class, 'show']);
Route::put('/promotions/{promotion}', [PromotionController::class, 'update']);
Route::delete('/promotions/{promotion}', [PromotionController::class, 'destroy']);

Route::get('/exports/{export}', [PromotionController::class, 'downloadExport']);
Route::post('/uploads', [UploadController::class, 'store']);

// Compatibility aliases for the first version of the editor.
Route::get('/promotion', [PromotionController::class, 'legacyShow']);
Route::put('/promotion', [PromotionController::class, 'legacyUpdate']);
Route::get('/promotion/history', [PromotionController::class, 'legacyHistory']);
Route::get('/promotion/pdf', [PromotionController::class, 'legacyPdf']);
