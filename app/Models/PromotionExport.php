<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionExport extends Model
{
    protected $table = 'PromotionExport';

    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = null;

    public $timestamps = true;

    protected $fillable = [
        'promotionId',
        'kind',
        'format',
        'pageNumber',
        'path',
    ];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'promotionId' => 'integer',
            'pageNumber' => 'integer',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class, 'promotionId');
    }
}
