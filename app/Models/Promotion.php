<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Promotion extends Model
{
    protected $table = 'Promotion';

    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'storeId',
        'title',
        'subtitle',
        'note',
        'badgeText',
        'hashtag',
        'startsAt',
        'endsAt',
        'status',
        'theme',
        'palette',
        'version',
    ];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'storeId' => 'integer',
            'version' => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'storeId');
    }

    public function pages(): HasMany
    {
        return $this->hasMany(PromotionPage::class, 'promotionId');
    }

    public function history(): HasMany
    {
        return $this->hasMany(PromotionHistory::class, 'promotionId');
    }

    public function exports(): HasMany
    {
        return $this->hasMany(PromotionExport::class, 'promotionId');
    }
}
