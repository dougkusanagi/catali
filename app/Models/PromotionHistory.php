<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionHistory extends Model
{
    protected $table = 'PromotionHistory';

    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = null;

    public $timestamps = true;

    protected $fillable = [
        'promotionId',
        'promotionVersion',
        'snapshot',
    ];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'promotionId' => 'integer',
            'promotionVersion' => 'integer',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class, 'promotionId');
    }
}
