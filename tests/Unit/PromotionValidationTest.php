<?php

require_once dirname(__DIR__, 2) . '/php/bootstrap.php';

function valid_promotion_input(array $overrides = []): array
{
    return array_replace_recursive([
        'title' => 'Ofertas da semana',
        'subtitle' => 'Preço de atacado',
        'note' => 'Enquanto durarem os estoques',
        'badgeText' => 'ATACADO',
        'hashtag' => '#VEMPROCRÔNICAS',
        'version' => 1,
        'products' => [
            [
                'imagePath' => '/uploads/produto.jpg',
                'wholesalePriceCents' => 10000,
                'position' => 0,
            ],
        ],
    ], $overrides);
}

test('accepts a valid promotion payload', function () {
    expect(validate_promotion(valid_promotion_input()))
        ->toMatchArray([
            'title' => 'Ofertas da semana',
            'version' => 1,
            'products' => [
                [
                    'imagePath' => '/uploads/produto.jpg',
                    'wholesalePriceCents' => 10000,
                    'position' => 0,
                ],
            ],
        ]);
});

test('rejects products without a positive wholesale price', function () {
    expect(fn () => validate_promotion(valid_promotion_input([
        'products' => [[
            'imagePath' => '/uploads/produto.jpg',
            'wholesalePriceCents' => 0,
            'position' => 0,
        ]],
    ])))->toThrow(InvalidArgumentException::class, 'Preço de atacado inválido.');
});

test('rejects product paths outside the uploads directory', function () {
    expect(fn () => validate_promotion(valid_promotion_input([
        'products' => [[
            'imagePath' => '/storage/produto.jpg',
            'wholesalePriceCents' => 10000,
            'position' => 0,
        ]],
    ])))->toThrow(InvalidArgumentException::class, 'Caminho da imagem inválido.');
});

test('rejects an empty required title', function () {
    expect(fn () => validate_promotion(valid_promotion_input(['title' => '   '])))
        ->toThrow(InvalidArgumentException::class, 'Título é obrigatório.');
});
