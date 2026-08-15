<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CLASSIC_CAPACITY = 6;

    public function up(): void
    {
        $this->createStoreTable();
        $this->ensureDefaultStore();

        $this->createPromotionTable();
        $this->addPromotionColumns();

        $this->createPageTable();
        $this->ensurePromotionPages();

        $this->createProductTable();
        $this->addProductColumns();
        $this->migrateLegacyProducts();

        $this->createHistoryTable();
        $this->addHistoryColumns();

        $this->createExportTable();
    }

    private function createStoreTable(): void
    {
        if (Schema::hasTable('Store')) {
            return;
        }

        Schema::create('Store', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 80)->default('Crônicas');
            $table->string('logoPath')->nullable();
            $table->string('defaultTheme', 32)->default('brutalista');
            $table->string('defaultPalette', 32)->default('energia');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->useCurrent();
        });
    }

    private function ensureDefaultStore(): void
    {
        $now = now()->format('Y-m-d H:i:s');

        DB::table('Store')->insertOrIgnore([
            'id' => 1,
            'name' => 'Crônicas',
            'logoPath' => '/logo-cronicas.png',
            'defaultTheme' => 'brutalista',
            'defaultPalette' => 'energia',
            'createdAt' => $now,
            'updatedAt' => $now,
        ]);
    }

    private function createPromotionTable(): void
    {
        if (Schema::hasTable('Promotion')) {
            return;
        }

        Schema::create('Promotion', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('storeId')->default(1);
            $table->string('title', 60)->default('Ofertas da semana');
            $table->string('subtitle', 120)->default('Preço de atacado para você economizar de verdade');
            $table->string('note', 140)->default('Ofertas válidas enquanto durarem os estoques');
            $table->string('badgeText', 30)->default('ATACADO');
            $table->string('hashtag', 40)->default('#VEMPROCRÔNICAS');
            $table->dateTime('startsAt')->nullable();
            $table->dateTime('endsAt')->nullable();
            $table->string('status', 16)->default('draft');
            $table->string('theme', 32)->default('brutalista');
            $table->string('palette', 32)->default('energia');
            $table->unsignedInteger('version')->default(1);
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->useCurrent();
        });
    }

    private function addPromotionColumns(): void
    {
        if (! Schema::hasColumn('Promotion', 'storeId')) {
            Schema::table('Promotion', fn (Blueprint $table) => $table->unsignedBigInteger('storeId')->default(1));
        }
        if (! Schema::hasColumn('Promotion', 'startsAt')) {
            Schema::table('Promotion', fn (Blueprint $table) => $table->dateTime('startsAt')->nullable());
        }
        if (! Schema::hasColumn('Promotion', 'endsAt')) {
            Schema::table('Promotion', fn (Blueprint $table) => $table->dateTime('endsAt')->nullable());
        }
        if (! Schema::hasColumn('Promotion', 'status')) {
            Schema::table('Promotion', fn (Blueprint $table) => $table->string('status', 16)->default('draft'));
        }
        if (! Schema::hasColumn('Promotion', 'theme')) {
            Schema::table('Promotion', fn (Blueprint $table) => $table->string('theme', 32)->default('brutalista'));
        }
        if (! Schema::hasColumn('Promotion', 'palette')) {
            Schema::table('Promotion', fn (Blueprint $table) => $table->string('palette', 32)->default('energia'));
        }

        DB::table('Promotion')->whereNull('storeId')->update(['storeId' => 1]);
        DB::table('Promotion')->whereNull('status')->orWhere('status', '')->update(['status' => 'draft']);
        DB::table('Promotion')->whereNull('theme')->orWhere('theme', '')->update(['theme' => 'brutalista']);
        DB::table('Promotion')->whereNull('palette')->orWhere('palette', '')->update(['palette' => 'energia']);
    }

    private function createPageTable(): void
    {
        if (Schema::hasTable('PromotionPage')) {
            return;
        }

        Schema::create('PromotionPage', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('promotionId');
            $table->unsignedInteger('position')->default(0);
            $table->string('grid', 32)->default('classic');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->useCurrent();
            $table->index(['promotionId', 'position']);
        });
    }

    private function ensurePromotionPages(): void
    {
        DB::table('Promotion')->orderBy('id')->each(function (object $promotion): void {
            if (! DB::table('PromotionPage')->where('promotionId', $promotion->id)->exists()) {
                DB::table('PromotionPage')->insert([
                    'promotionId' => $promotion->id,
                    'position' => 0,
                    'grid' => 'classic',
                    'createdAt' => now()->format('Y-m-d H:i:s'),
                    'updatedAt' => now()->format('Y-m-d H:i:s'),
                ]);
            }
        });
    }

    private function createProductTable(): void
    {
        if (Schema::hasTable('Product')) {
            return;
        }

        Schema::create('Product', function (Blueprint $table): void {
            $table->id();
            $table->string('imagePath');
            $table->string('name', 60)->default('');
            $table->unsignedInteger('wholesalePriceCents');
            $table->unsignedInteger('position')->default(0);
            $table->boolean('isHighlighted')->default(false);
            $table->unsignedBigInteger('promotionPageId');
            $table->dateTime('createdAt')->useCurrent();
            $table->dateTime('updatedAt')->useCurrent();
            $table->index(['promotionPageId', 'position']);
        });
    }

    private function addProductColumns(): void
    {
        if (! Schema::hasColumn('Product', 'name')) {
            Schema::table('Product', fn (Blueprint $table) => $table->string('name', 60)->default(''));
        }
        if (! Schema::hasColumn('Product', 'isHighlighted')) {
            Schema::table('Product', fn (Blueprint $table) => $table->boolean('isHighlighted')->default(false));
        }
        if (! Schema::hasColumn('Product', 'promotionPageId')) {
            Schema::table('Product', fn (Blueprint $table) => $table->unsignedBigInteger('promotionPageId')->nullable());
        }
    }

    private function migrateLegacyProducts(): void
    {
        if (! Schema::hasColumn('Product', 'promotionId')) {
            return;
        }

        DB::table('Promotion')->orderBy('id')->each(function (object $promotion): void {
            $legacyProducts = DB::table('Product')
                ->where('promotionId', $promotion->id)
                ->whereNull('promotionPageId')
                ->orderBy('position')
                ->orderBy('id')
                ->get()
                ->all();

            if ($legacyProducts === []) {
                return;
            }

            foreach (array_chunk($legacyProducts, self::CLASSIC_CAPACITY) as $chunkIndex => $chunk) {
                $pagePosition = $chunkIndex;
                $page = DB::table('PromotionPage')
                    ->where('promotionId', $promotion->id)
                    ->where('position', $pagePosition)
                    ->first();

                if (! $page) {
                    $pageId = DB::table('PromotionPage')->insertGetId([
                        'promotionId' => $promotion->id,
                        'position' => $pagePosition,
                        'grid' => 'classic',
                        'createdAt' => now()->format('Y-m-d H:i:s'),
                        'updatedAt' => now()->format('Y-m-d H:i:s'),
                    ]);
                } else {
                    $pageId = $page->id;
                }

                foreach ($chunk as $position => $product) {
                    DB::table('Product')->where('id', $product->id)->update([
                        'promotionPageId' => $pageId,
                        'position' => $position,
                    ]);
                }
            }
        });

        // Repair databases where an earlier compatibility layer assigned too
        // many products to the first page.
        DB::table('PromotionPage')->orderBy('promotionId')->orderBy('position')->each(function (object $page): void {
            $products = DB::table('Product')
                ->where('promotionPageId', $page->id)
                ->orderBy('position')
                ->orderBy('id')
                ->get()
                ->all();

            if (count($products) <= self::CLASSIC_CAPACITY) {
                return;
            }

            foreach (array_chunk($products, self::CLASSIC_CAPACITY) as $chunkIndex => $chunk) {
                $pagePosition = (int) $page->position + $chunkIndex;
                $target = DB::table('PromotionPage')
                    ->where('promotionId', $page->promotionId)
                    ->where('position', $pagePosition)
                    ->first();
                $pageId = $target?->id;

                if (! $pageId) {
                    $pageId = DB::table('PromotionPage')->insertGetId([
                        'promotionId' => $page->promotionId,
                        'position' => $pagePosition,
                        'grid' => 'classic',
                        'createdAt' => now()->format('Y-m-d H:i:s'),
                        'updatedAt' => now()->format('Y-m-d H:i:s'),
                    ]);
                }

                foreach ($chunk as $position => $product) {
                    DB::table('Product')->where('id', $product->id)->update([
                        'promotionPageId' => $pageId,
                        'position' => $position,
                    ]);
                }
            }
        });
    }

    private function createHistoryTable(): void
    {
        if (Schema::hasTable('PromotionHistory')) {
            return;
        }

        Schema::create('PromotionHistory', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('promotionId')->default(1);
            $table->unsignedInteger('promotionVersion');
            $table->text('snapshot');
            $table->dateTime('createdAt')->useCurrent();
            $table->index(['promotionId', 'promotionVersion']);
        });
    }

    private function addHistoryColumns(): void
    {
        if (! Schema::hasColumn('PromotionHistory', 'promotionId')) {
            Schema::table('PromotionHistory', fn (Blueprint $table) => $table->unsignedBigInteger('promotionId')->default(1));
        }

        DB::table('PromotionHistory')->whereNull('promotionId')->update(['promotionId' => 1]);
    }

    private function createExportTable(): void
    {
        if (Schema::hasTable('PromotionExport')) {
            return;
        }

        Schema::create('PromotionExport', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('promotionId');
            $table->string('kind', 16);
            $table->string('format', 8);
            $table->unsignedInteger('pageNumber')->nullable();
            $table->string('path');
            $table->dateTime('createdAt')->useCurrent();
            $table->index(['promotionId', 'createdAt']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('PromotionExport');
        Schema::dropIfExists('PromotionHistory');
        Schema::dropIfExists('Product');
        Schema::dropIfExists('PromotionPage');
        Schema::dropIfExists('Promotion');
        Schema::dropIfExists('Store');
    }
};
