<?php

namespace App\Services;

use App\Models\Promotion;
use App\Models\PromotionExport;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\Process\Process;

class ExportService
{
    public function __construct(private readonly PromotionService $promotions)
    {
    }

    public function generate(
        Promotion $promotion,
        string $kind,
        string $format,
        ?int $pageNumber = null,
        ?Request $request = null,
    ): PromotionExport {
        $payload = $this->promotions->payload($promotion);
        $pages = $payload['pages'];

        if ($kind === 'page') {
            if ($pageNumber === null || $pageNumber < 1 || $pageNumber > count($pages)) {
                throw new RuntimeException('Página de exportação inválida.');
            }
        }

        if (! in_array($kind, ['promotion', 'page', 'cover'], true)) {
            throw new RuntimeException('Tipo de exportação inválido.');
        }
        if (! in_array($format, ['pdf', 'jpg'], true)) {
            throw new RuntimeException('Formato de exportação inválido.');
        }
        if ($kind === 'promotion' && $format !== 'pdf') {
            throw new RuntimeException('A promoção completa só pode ser exportada em PDF.');
        }
        if ($kind === 'cover' && $format !== 'jpg') {
            throw new RuntimeException('A capa só pode ser exportada em JPG.');
        }

        $baseName = match ($kind) {
            'promotion' => 'promocao-cronicas.pdf',
            'page' => 'promocao-pagina-'.$pageNumber.'.jpg',
            'cover' => 'capa-promocao.jpg',
        };
        $relativePath = 'exports/'.Str::uuid()->toString().'-'.$baseName;
        $destination = storage_path($relativePath);
        $temporaryDirectory = storage_path('temp');
        $temporary = $temporaryDirectory.'/'.Str::uuid()->toString().'.'.$format;

        $this->ensureDirectories($temporaryDirectory, dirname($destination));

        try {
            $url = $this->printUrl(
                $promotion->id,
                $format === 'pdf' ? 'pdf' : ($kind === 'cover' ? 'cover' : 'jpg'),
                $pageNumber,
                $request,
            );
            $this->render($url, $temporary, $format === 'pdf' ? 'pdf' : ($kind === 'cover' ? 'cover' : 'jpg'));

            if (! is_file($temporary) || filesize($temporary) < 100) {
                throw new RuntimeException('O renderizador não produziu um arquivo válido.');
            }

            if (! rename($temporary, $destination)) {
                throw new RuntimeException('Não foi possível publicar o arquivo exportado.');
            }

            return PromotionExport::create([
                'promotionId' => $promotion->id,
                'kind' => $kind,
                'format' => $format,
                'pageNumber' => $pageNumber,
                'path' => $relativePath,
            ]);
        } finally {
            if (is_file($temporary)) {
                @unlink($temporary);
            }
        }
    }

    public function download(PromotionExport $export): array
    {
        $path = storage_path($export->path);
        if (! is_file($path)) {
            throw new RuntimeException('Arquivo exportado não encontrado.');
        }

        return [$path, basename($path)];
    }

    private function render(string $url, string $output, string $format): void
    {
        $runtime = $this->runtimeBinary();
        $script = base_path('scripts/render-pdf.mjs');
        if (! is_file($script)) {
            $script = base_path('php/render-pdf.mjs');
        }
        if (! $runtime || ! is_file($script)) {
            throw new RuntimeException('Node/Bun e o script de renderização são necessários para exportar.');
        }

        $browser = $this->chromiumBinary();
        $arguments = [$script, $url, $output, $browser ?? '', config('services.pdf.no_sandbox') ? '1' : '0', $format];
        $process = new Process(array_merge([$runtime], $arguments), base_path());
        $process->setTimeout(180);
        $process->run();

        if (! $process->isSuccessful()) {
            $details = trim($process->getErrorOutput() ?: $process->getOutput());
            throw new RuntimeException('Falha ao gerar exportação.'.($details !== '' ? ' '.$details : ''));
        }
    }

    private function printUrl(int $promotionId, string $format, ?int $pageNumber, ?Request $request): string
    {
        $base = config('services.pdf.app_url')
            ?: ($request?->getSchemeAndHttpHost() ?: config('app.url'));
        $query = [
            'print' => 1,
            'promotion' => $promotionId,
        ];
        if ($format !== 'pdf') {
            $query['export'] = $format;
        }
        if ($pageNumber !== null) {
            $query['page'] = $pageNumber;
        }

        return rtrim((string) $base, '/').'/?'.http_build_query($query);
    }

    private function runtimeBinary(): ?string
    {
        $configured = config('services.pdf.runtime_bin');
        $candidates = array_filter([
            $configured,
            '/usr/local/bin/node',
            '/usr/bin/node',
            '/usr/local/bin/bun',
            '/usr/bin/bun',
            '/root/.bun/bin/bun',
        ]);

        foreach ($candidates as $candidate) {
            if (is_file($candidate) && is_executable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function chromiumBinary(): ?string
    {
        $configured = config('services.pdf.chromium_bin');
        $project = base_path();
        $candidates = array_merge(
            array_filter([$configured]),
            glob('/var/www/.cache/ms-playwright/*/chrome-headless-shell-linux64/chrome-headless-shell') ?: [],
            glob($project.'/node_modules/.cache/ms-playwright/*/chrome-headless-shell-linux64/chrome-headless-shell') ?: [],
            ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
            glob('/var/www/.cache/ms-playwright/*/chrome-linux*/chrome') ?: [],
            glob($project.'/node_modules/.cache/ms-playwright/*/chrome-linux*/chrome') ?: [],
        );

        foreach ($candidates as $candidate) {
            if (is_file($candidate) && is_executable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function ensureDirectories(string ...$directories): void
    {
        foreach ($directories as $directory) {
            if (! is_dir($directory) && ! mkdir($directory, 0775, true) && ! is_dir($directory)) {
                throw new RuntimeException('Não foi possível preparar o diretório de exportação.');
            }
        }
    }
}
