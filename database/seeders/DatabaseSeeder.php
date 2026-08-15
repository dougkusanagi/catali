<?php

namespace Database\Seeders;

use App\Models\Promotion;
use App\Models\PromotionPage;
use App\Models\Store;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $store = Store::query()->orderBy('id')->first();

        if (! $store) {
            $store = Store::create([
                'name' => 'Crônicas',
                'logoPath' => '/logo-cronicas.png',
                'defaultTheme' => 'brutalista',
                'defaultPalette' => 'energia',
            ]);
        }

        $promotion = Promotion::query()->orderBy('id')->first();

        if (! $promotion) {
            $promotion = Promotion::create([
                'storeId' => $store->id,
                'title' => 'Ofertas da semana',
                'subtitle' => 'Preço de atacado para você economizar de verdade',
                'note' => 'Ofertas válidas enquanto durarem os estoques',
                'badgeText' => 'ATACADO',
                'hashtag' => '#VEMPROCRÔNICAS',
                'status' => 'draft',
                'theme' => $store->defaultTheme,
                'palette' => $store->defaultPalette,
                'version' => 1,
            ]);
        }

        if (! $promotion->pages()->exists()) {
            PromotionPage::create([
                'promotionId' => $promotion->id,
                'position' => 0,
                'grid' => 'classic',
            ]);
        }
    }
}
