<?php

namespace App\Http\Controllers;

use App\Models\Promotion;
use App\Models\PromotionExport;
use App\Services\ExportService;
use App\Services\PromotionConflict;
use App\Services\PromotionService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;

class PromotionController extends Controller
{
    public function __construct(
        private readonly PromotionService $promotions,
        private readonly ExportService $exports,
    ) {
    }

    public function index(): JsonResponse
    {
        return response()->json(['items' => $this->promotions->list()]);
    }

    public function store(Request $request): JsonResponse
    {
        try {
            return response()->json($this->promotions->create($request->all()), 201);
        } catch (InvalidArgumentException $error) {
            return $this->error($error, 400);
        }
    }

    public function show(Promotion $promotion): JsonResponse
    {
        return response()->json($this->promotions->payload($promotion));
    }

    public function update(Request $request, Promotion $promotion): JsonResponse
    {
        try {
            $validated = $this->promotions->validatePromotion($request->all());

            return response()->json($this->promotions->save($promotion, $validated));
        } catch (PromotionConflict $error) {
            return response()->json([
                'error' => 'Outra pessoa salvou uma versão mais recente. Sua edição continua aberta, mas precisa ser revisada.',
                'code' => 'VERSION_CONFLICT',
                'promotion' => $error->promotion,
            ], 409);
        } catch (InvalidArgumentException $error) {
            return $this->error($error, 400);
        }
    }

    public function destroy(Promotion $promotion): JsonResponse
    {
        try {
            $this->promotions->delete($promotion);

            return response()->json(['ok' => true]);
        } catch (DomainException $error) {
            return $this->error($error, 409);
        }
    }

    public function duplicate(Promotion $promotion): JsonResponse
    {
        return response()->json($this->promotions->duplicate($promotion), 201);
    }

    public function status(Request $request, Promotion $promotion): JsonResponse
    {
        $status = $request->input('status');
        if (! is_string($status)) {
            return response()->json(['error' => 'Status inválido.'], 400);
        }

        try {
            return response()->json($this->promotions->updateStatus($promotion, $status));
        } catch (InvalidArgumentException $error) {
            return $this->error($error, 400);
        }
    }

    public function history(Promotion $promotion): JsonResponse
    {
        return response()->json(['items' => $this->promotions->history($promotion)]);
    }

    public function exports(Promotion $promotion): JsonResponse
    {
        return response()->json(['items' => $this->promotions->exports($promotion)]);
    }

    public function pdf(Request $request, Promotion $promotion)
    {
        return $this->exportResponse($request, $promotion, 'promotion', 'pdf');
    }

    public function jpg(Request $request, Promotion $promotion)
    {
        return $this->exportResponse($request, $promotion, 'page', 'jpg', $request->integer('page', 1));
    }

    public function cover(Request $request, Promotion $promotion)
    {
        return $this->exportResponse($request, $promotion, 'cover', 'jpg');
    }

    public function downloadExport(PromotionExport $export)
    {
        try {
            [$path, $storedName] = $this->exports->download($export);
            $downloadName = match ($export->kind) {
                'promotion' => 'promocao-cronicas.pdf',
                'page' => 'promocao-pagina-'.((int) $export->pageNumber).'.jpg',
                'cover' => 'capa-promocao.jpg',
                default => $storedName,
            };

            return response()->download($path, $downloadName, [
                'Content-Type' => $export->format === 'pdf' ? 'application/pdf' : 'image/jpeg',
            ]);
        } catch (RuntimeException $error) {
            return $this->error($error, 404);
        }
    }

    public function legacyShow(): JsonResponse
    {
        return response()->json($this->promotions->payload());
    }

    public function legacyUpdate(Request $request): JsonResponse
    {
        $promotion = $this->promotions->defaultPromotion();

        return $this->update($request, $promotion);
    }

    public function legacyHistory(): JsonResponse
    {
        return response()->json(['items' => $this->promotions->history($this->promotions->defaultPromotion())]);
    }

    public function legacyPdf(Request $request)
    {
        $promotion = $request->filled('promotion')
            ? Promotion::query()->findOrFail($request->integer('promotion'))
            : $this->promotions->defaultPromotion();

        return $this->exportResponse($request, $promotion, 'promotion', 'pdf');
    }

    private function exportResponse(Request $request, Promotion $promotion, string $kind, string $format, ?int $page = null)
    {
        try {
            $export = $this->exports->generate($promotion, $kind, $format, $page, $request);
            [$path] = $this->exports->download($export);
            $name = match ($kind) {
                'promotion' => 'promocao-cronicas.pdf',
                'page' => 'promocao-pagina-'.$page.'.jpg',
                'cover' => 'capa-promocao.jpg',
            };

            return response()->download($path, $name, [
                'Content-Type' => $format === 'pdf' ? 'application/pdf' : 'image/jpeg',
            ]);
        } catch (RuntimeException $error) {
            report($error);

            return $this->error($error, 500);
        }
    }

    private function error(\Throwable $error, int $status): JsonResponse
    {
        return response()->json(['error' => $error->getMessage()], $status);
    }
}
