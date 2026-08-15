<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Promotion;
use App\Models\PromotionExport;
use App\Models\PromotionHistory;
use App\Models\PromotionPage;
use App\Models\Store;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use InvalidArgumentException;
use RuntimeException;

class PromotionConflict extends RuntimeException
{
    public function __construct(public readonly array $promotion)
    {
        parent::__construct('A promoção foi alterada por outra pessoa.');
    }
}

class PromotionService
{
    public const STATUSES = ['draft', 'published', 'ended', 'archived'];

    public const GRIDS = [
        'classic' => 6,
        'feature-left' => 5,
        'feature-top' => 7,
    ];

    public const THEMES = ['brutalista', 'varejo', 'suave'];

    public function store(?int $id = null): Store
    {
        $query = Store::query()->orderBy('id');

        if ($id !== null) {
            return $query->whereKey($id)->firstOrFail();
        }

        $store = $query->first();

        if ($store) {
            return $store;
        }

        return Store::create([
            'name' => 'Crônicas',
            'logoPath' => '/logo-cronicas.png',
            'defaultTheme' => 'brutalista',
            'defaultPalette' => 'energia',
        ]);
    }

    public function defaultPromotion(): Promotion
    {
        $promotion = Promotion::query()->orderBy('id')->first();

        if (! $promotion) {
            $store = $this->store();
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

        $this->ensurePage($promotion);

        return $promotion;
    }

    public function payload(Promotion|int|null $promotion = null): array
    {
        $promotion = match (true) {
            $promotion instanceof Promotion => $promotion->fresh() ?? $promotion,
            is_int($promotion) => Promotion::query()->findOrFail($promotion),
            default => $this->defaultPromotion(),
        };

        $this->ensurePage($promotion);
        $promotion->load('store');

        $pages = PromotionPage::query()
            ->where('promotionId', $promotion->id)
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map(fn (PromotionPage $page): array => $this->pagePayload($page))
            ->values()
            ->all();

        $allProducts = array_merge(...array_map(
            static fn (array $page): array => $page['products'],
            $pages ?: [['products' => []]],
        ));

        $payload = $promotion->toArray();
        $payload['id'] = (int) $promotion->id;
        $payload['storeId'] = (int) $promotion->storeId;
        $payload['version'] = (int) ($promotion->version ?: 1);
        $payload['status'] = $promotion->status ?: 'draft';
        $payload['theme'] = $promotion->theme ?: 'brutalista';
        $payload['palette'] = $promotion->palette ?: 'energia';
        $payload['startsAt'] = $promotion->getRawOriginal('startsAt');
        $payload['endsAt'] = $promotion->getRawOriginal('endsAt');
        $payload['store'] = $this->storePayload($promotion->store);
        $payload['pages'] = $pages;
        // Compatibility for clients that still expect a flat product list.
        $payload['products'] = $allProducts;

        return $payload;
    }

    public function list(): array
    {
        $this->defaultPromotion();

        return Promotion::query()
            ->orderByDesc('updatedAt')
            ->orderByDesc('id')
            ->get()
            ->map(function (Promotion $promotion): array {
                $payload = $this->payload($promotion);
                $products = $payload['products'];
                $firstProduct = $products[0] ?? null;

                return [
                    'id' => $payload['id'],
                    'title' => $payload['title'],
                    'subtitle' => $payload['subtitle'],
                    'startsAt' => $payload['startsAt'],
                    'endsAt' => $payload['endsAt'],
                    'status' => $payload['status'],
                    'theme' => $payload['theme'],
                    'palette' => $payload['palette'],
                    'version' => $payload['version'],
                    'createdAt' => $payload['createdAt'],
                    'updatedAt' => $payload['updatedAt'],
                    'thumbnailPath' => $firstProduct['imagePath'] ?? null,
                    'productCount' => count($products),
                ];
            })
            ->values()
            ->all();
    }

    public function validatePromotion(array $input): array
    {
        $version = $input['version'] ?? null;
        if (! is_int($version) || $version < 1) {
            throw new InvalidArgumentException('Versão da promoção inválida. Recarregue a página.');
        }

        $rawPages = $input['pages'] ?? null;
        if ($rawPages === null) {
            if (! array_key_exists('products', $input) || ! is_array($input['products'])) {
                throw new InvalidArgumentException('Produtos inválidos.');
            }

            $legacyProducts = array_values($input['products']);
            $rawPages = array_map(
                static fn (array $products): array => ['grid' => 'classic', 'products' => $products],
                array_chunk($legacyProducts, self::GRIDS['classic']),
            );

            if ($rawPages === []) {
                $rawPages = [['grid' => 'classic', 'products' => []]];
            }
        }

        if (! is_array($rawPages) || count($rawPages) < 1 || count($rawPages) > 12) {
            throw new InvalidArgumentException('Adicione entre 1 e 12 páginas.');
        }

        $pages = [];
        $totalProducts = 0;

        foreach (array_values($rawPages) as $pageIndex => $rawPage) {
            if (! is_array($rawPage) || ! is_array($rawPage['products'] ?? null)) {
                throw new InvalidArgumentException('Página inválida.');
            }

            $grid = $rawPage['grid'] ?? 'classic';
            if (! is_string($grid) || ! array_key_exists($grid, self::GRIDS)) {
                throw new InvalidArgumentException('Grid da página inválido.');
            }

            $rawProducts = array_values($rawPage['products']);
            if (count($rawProducts) > self::GRIDS[$grid]) {
                throw new InvalidArgumentException(
                    'A página '.($pageIndex + 1).' excede a capacidade segura do grid.',
                );
            }

            $products = [];
            foreach ($rawProducts as $product) {
                if (! is_array($product)) {
                    throw new InvalidArgumentException('Produto inválido.');
                }

                $products[] = [
                    ...$this->validateProduct($product),
                    'position' => count($products),
                ];
            }

            if (count(array_filter($products, static fn (array $product): bool => $product['isHighlighted'])) > 1) {
                throw new InvalidArgumentException('Cada página pode ter apenas um produto em destaque.');
            }

            $pages[] = [
                'position' => $pageIndex,
                'grid' => $grid,
                'products' => $products,
            ];
            $totalProducts += count($products);
        }

        if ($totalProducts > 24) {
            throw new InvalidArgumentException('O limite é de 24 produtos por promoção.');
        }

        $status = $input['status'] ?? null;
        if ($status !== null && (! is_string($status) || ! in_array($status, self::STATUSES, true))) {
            throw new InvalidArgumentException('Status da promoção inválido.');
        }

        $theme = $input['theme'] ?? 'brutalista';
        if (! is_string($theme) || ! in_array($theme, self::THEMES, true)) {
            throw new InvalidArgumentException('Tema da promoção inválido.');
        }

        $palette = $input['palette'] ?? 'energia';
        if (! is_string($palette) || ! preg_match('/^[a-z0-9-]{2,32}$/', $palette)) {
            throw new InvalidArgumentException('Paleta da promoção inválida.');
        }

        $startsAt = $this->validateDate($input['startsAt'] ?? null, 'Data de início');
        $endsAt = $this->validateDate($input['endsAt'] ?? null, 'Data de fim');

        if ($startsAt !== null && $endsAt !== null && strtotime($endsAt) < strtotime($startsAt)) {
            throw new InvalidArgumentException('A data de fim deve ser posterior à data de início.');
        }

        return [
            'title' => $this->validateText($input['title'] ?? null, 'Título', 60, true),
            'subtitle' => $this->validateText($input['subtitle'] ?? null, 'Chamada', 120, false),
            'note' => $this->validateText($input['note'] ?? null, 'Rodapé', 140, false),
            'badgeText' => $this->validateText($input['badgeText'] ?? null, 'Selo vermelho', 30, true),
            'hashtag' => $this->validateText($input['hashtag'] ?? null, 'Hashtag', 40, true),
            'startsAt' => $startsAt,
            'endsAt' => $endsAt,
            'status' => $status,
            'theme' => $theme,
            'palette' => $palette,
            'version' => $version,
            'pages' => $pages,
            'products' => array_merge(...array_map(
                static fn (array $page): array => array_map(
                    static fn (array $product): array => [
                        'imagePath' => $product['imagePath'],
                        'name' => $product['name'],
                        'wholesalePriceCents' => $product['wholesalePriceCents'],
                        'position' => $product['position'],
                    ],
                    $page['products'],
                ),
                $pages ?: [['products' => []]],
            )),
        ];
    }

    public function save(Promotion $promotion, array $input): array
    {
        return DB::transaction(function () use ($promotion, $input): array {
            $current = $this->payload($promotion);

            if ($current['version'] !== $input['version']) {
                throw new PromotionConflict($current);
            }

            $newVersion = $input['version'] + 1;
            $updated = Promotion::query()
                ->whereKey($promotion->id)
                ->where('version', $input['version'])
                ->update([
                    'title' => $input['title'],
                    'subtitle' => $input['subtitle'],
                    'note' => $input['note'],
                    'badgeText' => $input['badgeText'],
                    'hashtag' => $input['hashtag'],
                    'startsAt' => $input['startsAt'],
                    'endsAt' => $input['endsAt'],
                    'status' => $input['status'] ?? $current['status'],
                    'theme' => $input['theme'],
                    'palette' => $input['palette'],
                    'version' => $newVersion,
                    'updatedAt' => now()->format('Y-m-d H:i:s'),
                ]);

            if ($updated !== 1) {
                throw new PromotionConflict($this->payload($promotion->fresh()));
            }

            $pageIds = PromotionPage::query()->where('promotionId', $promotion->id)->pluck('id');
            if ($pageIds->isNotEmpty()) {
                Product::query()->whereIn('promotionPageId', $pageIds)->delete();
            }
            PromotionPage::query()->where('promotionId', $promotion->id)->delete();

            foreach ($input['pages'] as $pageData) {
                $page = PromotionPage::create([
                    'promotionId' => $promotion->id,
                    'position' => $pageData['position'],
                    'grid' => $pageData['grid'],
                ]);

                foreach ($pageData['products'] as $productData) {
                    $attributes = [
                        'imagePath' => $productData['imagePath'],
                        'name' => $productData['name'],
                        'wholesalePriceCents' => $productData['wholesalePriceCents'],
                        'position' => $productData['position'],
                        'isHighlighted' => $productData['isHighlighted'],
                        'promotionPageId' => $page->id,
                    ];

                    if (Schema::hasColumn('Product', 'promotionId')) {
                        $attributes['promotionId'] = $promotion->id;
                    }

                    Product::create($attributes);
                }
            }

            $saved = $this->payload($promotion->fresh());
            $this->recordSnapshot($saved);

            return $saved;
        });
    }

    public function create(array $input = []): array
    {
        $store = $this->store();
        $title = $this->validateText($input['title'] ?? 'Nova promoção', 'Título', 60, true);
        $theme = is_string($input['theme'] ?? null) && in_array($input['theme'], self::THEMES, true)
            ? $input['theme']
            : $store->defaultTheme;
        $palette = is_string($input['palette'] ?? null) && preg_match('/^[a-z0-9-]{2,32}$/', $input['palette'])
            ? $input['palette']
            : $store->defaultPalette;

        $promotion = Promotion::create([
            'storeId' => $store->id,
            'title' => $title,
            'theme' => $theme,
            'palette' => $palette,
            'status' => 'draft',
            'version' => 1,
        ]);
        $this->ensurePage($promotion);

        return $this->payload($promotion);
    }

    public function duplicate(Promotion $source): array
    {
        return DB::transaction(function () use ($source): array {
            $payload = $this->payload($source);
            $copy = Promotion::create([
                'storeId' => $payload['storeId'],
                'title' => mb_substr(trim($payload['title'].' (cópia)'), 0, 60),
                'subtitle' => $payload['subtitle'],
                'note' => $payload['note'],
                'badgeText' => $payload['badgeText'],
                'hashtag' => $payload['hashtag'],
                'startsAt' => $payload['startsAt'],
                'endsAt' => $payload['endsAt'],
                'status' => 'draft',
                'theme' => $payload['theme'],
                'palette' => $payload['palette'],
                'version' => 1,
            ]);

            foreach ($payload['pages'] as $pageData) {
                $page = PromotionPage::create([
                    'promotionId' => $copy->id,
                    'position' => $pageData['position'],
                    'grid' => $pageData['grid'],
                ]);

                foreach ($pageData['products'] as $productData) {
                    $attributes = [
                        'imagePath' => $productData['imagePath'],
                        'name' => $productData['name'],
                        'wholesalePriceCents' => $productData['wholesalePriceCents'],
                        'position' => $productData['position'],
                        'isHighlighted' => $productData['isHighlighted'],
                        'promotionPageId' => $page->id,
                    ];

                    if (Schema::hasColumn('Product', 'promotionId')) {
                        $attributes['promotionId'] = $copy->id;
                    }

                    Product::create($attributes);
                }
            }

            return $this->payload($copy);
        });
    }

    public function updateStatus(Promotion $promotion, string $status): array
    {
        if (! in_array($status, self::STATUSES, true)) {
            throw new InvalidArgumentException('Status da promoção inválido.');
        }

        $promotion->update([
            'status' => $status,
            'updatedAt' => now()->format('Y-m-d H:i:s'),
        ]);

        return $this->payload($promotion->fresh());
    }

    public function delete(Promotion $promotion): void
    {
        $payload = $this->payload($promotion);
        if ($payload['status'] !== 'draft' || $payload['products'] !== []) {
            throw new \DomainException('Só é possível excluir um rascunho vazio.');
        }

        DB::transaction(function () use ($promotion): void {
            $pageIds = PromotionPage::query()->where('promotionId', $promotion->id)->pluck('id');
            Product::query()->whereIn('promotionPageId', $pageIds)->delete();
            PromotionPage::query()->where('promotionId', $promotion->id)->delete();
            PromotionHistory::query()->where('promotionId', $promotion->id)->delete();
            PromotionExport::query()->where('promotionId', $promotion->id)->delete();
            $promotion->delete();
        });
    }

    public function validateStore(array $input): array
    {
        $theme = $input['defaultTheme'] ?? 'brutalista';
        if (! is_string($theme) || ! in_array($theme, self::THEMES, true)) {
            throw new InvalidArgumentException('Tema padrão inválido.');
        }

        $palette = $input['defaultPalette'] ?? 'energia';
        if (! is_string($palette) || ! preg_match('/^[a-z0-9-]{2,32}$/', $palette)) {
            throw new InvalidArgumentException('Paleta padrão inválida.');
        }

        $logoPath = $input['logoPath'] ?? null;
        if ($logoPath !== null && (! is_string($logoPath) || (! str_starts_with($logoPath, '/uploads/') && ! str_starts_with($logoPath, '/logo-')))) {
            throw new InvalidArgumentException('Caminho do logo inválido.');
        }

        return [
            'name' => $this->validateText($input['name'] ?? null, 'Nome da loja', 80, true),
            'logoPath' => $logoPath,
            'defaultTheme' => $theme,
            'defaultPalette' => $palette,
        ];
    }

    public function saveStore(array $input): Store
    {
        $store = $this->store();
        $store->update($this->validateStore($input));

        return $store->fresh();
    }

    public function history(Promotion $promotion): array
    {
        return PromotionHistory::query()
            ->where('promotionId', $promotion->id)
            ->orderByDesc('id')
            ->limit(10)
            ->get(['promotionVersion', 'snapshot', 'createdAt'])
            ->map(fn (PromotionHistory $item): array => [
                'promotionVersion' => (int) $item->promotionVersion,
                'snapshot' => $item->snapshot,
                'createdAt' => $item->createdAt,
            ])
            ->all();
    }

    public function exports(Promotion $promotion): array
    {
        return PromotionExport::query()
            ->where('promotionId', $promotion->id)
            ->orderByDesc('id')
            ->limit(30)
            ->get()
            ->map(fn (PromotionExport $item): array => [
                'id' => (int) $item->id,
                'kind' => $item->kind,
                'format' => $item->format,
                'pageNumber' => $item->pageNumber === null ? null : (int) $item->pageNumber,
                'path' => $item->path,
                'createdAt' => $item->createdAt,
                'downloadPath' => '/api/exports/'.$item->id,
            ])
            ->all();
    }

    private function ensurePage(Promotion $promotion): PromotionPage
    {
        return PromotionPage::query()->firstOrCreate(
            ['promotionId' => $promotion->id, 'position' => 0],
            ['grid' => 'classic'],
        );
    }

    private function pagePayload(PromotionPage $page): array
    {
        $products = $page->products()
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map(function (Product $product): array {
                $payload = $product->toArray();
                $payload['id'] = (int) $product->id;
                $payload['wholesalePriceCents'] = (int) $product->wholesalePriceCents;
                $payload['position'] = (int) $product->position;
                $payload['promotionPageId'] = (int) $product->promotionPageId;
                $payload['isHighlighted'] = (bool) $product->isHighlighted;
                $payload['name'] = (string) ($product->name ?? '');

                return $payload;
            })
            ->values()
            ->all();

        return [
            ...$page->toArray(),
            'id' => (int) $page->id,
            'promotionId' => (int) $page->promotionId,
            'position' => (int) $page->position,
            'products' => $products,
        ];
    }

    private function storePayload(Store $store): array
    {
        $payload = $store->toArray();
        $payload['id'] = (int) $store->id;

        return $payload;
    }

    private function recordSnapshot(array $promotion): void
    {
        PromotionHistory::create([
            'promotionId' => $promotion['id'],
            'promotionVersion' => $promotion['version'],
            'snapshot' => json_encode($promotion, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        ]);

        $staleIds = PromotionHistory::query()
            ->where('promotionId', $promotion['id'])
            ->orderByDesc('id')
            ->get(['id'])
            ->skip(10)
            ->pluck('id');

        if ($staleIds->isNotEmpty()) {
            PromotionHistory::query()->whereIn('id', $staleIds)->delete();
        }
    }

    private function validateProduct(array $product): array
    {
        $imagePath = $product['imagePath'] ?? null;
        $price = $product['wholesalePriceCents'] ?? null;
        if (! is_string($imagePath) || ! str_starts_with($imagePath, '/uploads/')) {
            throw new InvalidArgumentException('Caminho da imagem inválido.');
        }
        if (! is_int($price) || $price <= 0) {
            throw new InvalidArgumentException('Preço de atacado inválido.');
        }

        $name = $product['name'] ?? '';
        if (! is_string($name) || mb_strlen(trim($name)) > 60) {
            throw new InvalidArgumentException('Nome do produto excede o limite.');
        }

        return [
            'imagePath' => $imagePath,
            'name' => trim($name),
            'wholesalePriceCents' => $price,
            'isHighlighted' => (bool) ($product['isHighlighted'] ?? false),
        ];
    }

    private function validateText(mixed $value, string $field, int $maxLength, bool $required): string
    {
        if (! is_string($value)) {
            throw new InvalidArgumentException("{$field} inválido.");
        }

        $value = trim($value);
        if ($required && $value === '') {
            throw new InvalidArgumentException("{$field} é obrigatório.");
        }
        if (mb_strlen($value) > $maxLength) {
            throw new InvalidArgumentException("{$field} excede o limite.");
        }

        return $value;
    }

    private function validateDate(mixed $value, string $field): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (! is_string($value) || strtotime($value) === false) {
            throw new InvalidArgumentException("{$field} inválida.");
        }

        return $value;
    }
}
