<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Store extends Model
{
    protected $table = 'Store';

    public const CREATED_AT = 'createdAt';
    public const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'name',
        'logoPath',
        'defaultTheme',
        'defaultPalette',
    ];

    protected function casts(): array
    {
        return [
            'id' => 'integer',
        ];
    }

    public function promotions(): HasMany
    {
        return $this->hasMany(Promotion::class, 'storeId');
    }
}
