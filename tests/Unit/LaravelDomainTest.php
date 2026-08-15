<?php

use App\Services\PromotionConflict;
use App\Services\PromotionService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

beforeEach(function (): void {
    config([
        'database.default' => 'sqlite',
        'database.connections.sqlite.database' => ':memory:',
    ]);
    DB::purge('sqlite');
    Artisan::call('migrate:fresh', ['--force' => true]);
    app(DatabaseSeeder::class)->run();
});

test('Laravel exposes the seeded promotion through the SaaS payload', function () {
    $service = app(PromotionService::class);
    $promotion = $service->defaultPromotion();
    $payload = $service->payload($promotion);

    expect($payload['store']['name'])->toBe('Crônicas');
    expect($payload['pages'])->toHaveCount(1);
    expect($payload['pages'][0]['grid'])->toBe('classic');
    expect($payload['products'])->toBeEmpty();
});

test('Laravel validates grid capacity and optimistic versions', function () {
    $service = app(PromotionService::class);
    $promotion = $service->defaultPromotion();
    $payload = $service->payload($promotion);
    $product = [
        'imagePath' => '/uploads/produto.jpg',
        'name' => 'Produto',
        'wholesalePriceCents' => 2500,
        'isHighlighted' => true,
    ];
    $payload['pages'][0]['grid'] = 'feature-top';
    $payload['pages'][0]['products'] = [$product];

    $validated = $service->validatePromotion($payload);
    $saved = $service->save($promotion, $validated);

    expect($saved['version'])->toBe(2);
    expect(fn () => $service->save($promotion->fresh(), $validated))
        ->toThrow(PromotionConflict::class);
});

test('Laravel duplication copies pages and products without history', function () {
    $service = app(PromotionService::class);
    $promotion = $service->defaultPromotion();
    $payload = $service->payload($promotion);
    $payload['pages'][0]['grid'] = 'feature-left';
    $payload['pages'][0]['products'] = [[
        'imagePath' => '/uploads/produto.jpg',
        'name' => 'Produto',
        'wholesalePriceCents' => 1000,
        'isHighlighted' => true,
    ]];

    $service->save($promotion, $service->validatePromotion($payload));
    $copy = $service->duplicate($promotion->fresh());

    expect($copy['status'])->toBe('draft');
    expect($copy['pages'][0]['grid'])->toBe('feature-left');
    expect($copy['products'][0]['imagePath'])->toBe('/uploads/produto.jpg');
    expect($service->history(App\Models\Promotion::findOrFail($copy['id'])))->toBeEmpty();
});

test('Laravel migration preserves a legacy promotion and product', function () {
    config([
        'database.default' => 'sqlite',
        'database.connections.sqlite.database' => ':memory:',
    ]);
    DB::purge('sqlite');

    DB::unprepared(<<<'SQL'
        CREATE TABLE "Promotion" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "title" TEXT NOT NULL DEFAULT 'Ofertas da semana',
            "subtitle" TEXT NOT NULL DEFAULT '',
            "note" TEXT NOT NULL DEFAULT '',
            "badgeText" TEXT NOT NULL DEFAULT 'ATACADO',
            "hashtag" TEXT NOT NULL DEFAULT '#VEMPROCRÔNICAS',
            "version" INTEGER NOT NULL DEFAULT 1,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "Product" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "imagePath" TEXT NOT NULL,
            "wholesalePriceCents" INTEGER NOT NULL,
            "position" INTEGER NOT NULL DEFAULT 0,
            "promotionId" INTEGER NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "PromotionHistory" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "promotionVersion" INTEGER NOT NULL,
            "snapshot" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO "Promotion" ("id", "title") VALUES (1, 'Promoção antiga');
        INSERT INTO "Product" ("imagePath", "wholesalePriceCents", "promotionId")
        VALUES ('/uploads/legacy.jpg', 1990, 1);
    SQL);

    $migration = require base_path('database/migrations/2026_08_15_120000_create_promotion_saas_tables.php');
    $migration->up();
    $payload = app(PromotionService::class)->payload(1);

    expect(Schema::hasTable('Store'))->toBeTrue();
    expect($payload['store']['name'])->toBe('Crônicas');
    expect($payload['pages'])->toHaveCount(1);
    expect($payload['products'][0]['imagePath'])->toBe('/uploads/legacy.jpg');
    expect($payload['products'][0]['promotionPageId'])->toBe($payload['pages'][0]['id']);
});
