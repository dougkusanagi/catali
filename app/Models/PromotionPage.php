<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PromotionPage extends Model
{
    protected $table = 'PromotionPage';

    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'promotionId',
        'position',
        'grid',
    ];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'promotionId' => 'integer',
            'position' => 'integer',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class, 'promotionId');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'promotionPageId');
    }
}
