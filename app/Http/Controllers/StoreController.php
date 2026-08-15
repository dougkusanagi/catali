<?php

namespace App\Http\Controllers;

use App\Services\PromotionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

class StoreController extends Controller
{
    public function __construct(private readonly PromotionService $promotions)
    {
    }

    public function show(): JsonResponse
    {
        return response()->json($this->payload($this->promotions->store()));
    }

    public function update(Request $request): JsonResponse
    {
        try {
            return response()->json($this->payload($this->promotions->saveStore($request->all())));
        } catch (InvalidArgumentException $error) {
            return response()->json(['error' => $error->getMessage()], 400);
        }
    }

    private function payload(object $store): array
    {
        $payload = $store->toArray();
        $payload['id'] = (int) $store->id;

        return $payload;
    }
}
