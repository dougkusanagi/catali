<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    protected $table = 'Product';

    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'imagePath',
        'name',
        'wholesalePriceCents',
        'position',
        'isHighlighted',
        'promotionPageId',
        'promotionId',
    ];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'wholesalePriceCents' => 'integer',
            'position' => 'integer',
            'isHighlighted' => 'boolean',
            'promotionPageId' => 'integer',
            'promotionId' => 'integer',
        ];
    }

    public function page(): BelongsTo
    {
        return $this->belongsTo(PromotionPage::class, 'promotionPageId');
    }
}
