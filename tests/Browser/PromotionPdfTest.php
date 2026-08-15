<?php

test('a user can generate a PDF from the editor', function () {
    $url = rtrim(getenv('E2E_APP_URL') ?: 'http://127.0.0.1:5199', '/');
    $fixture = dirname(__DIR__, 2) . '/public/logo-cronicas.png';

    $page = visit($url);
    $page->script(<<<'JS'
        window.__pdfTest = null;
        window.__pdfDownload = null;
        window.__saveAttempts = 0;
        const originalFetch = window.fetch.bind(window);
        const originalAnchorClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function (...args) {
            if (this.download === 'promocao-cronicas.pdf') {
                window.__pdfDownload = {
                    connected: document.body.contains(this),
                    download: this.download,
                    href: this.href,
                };
            }
            return originalAnchorClick.call(this, ...args);
        };
        window.fetch = async (...args) => {
            if (String(args[0]).includes('/api/promotion') && args[1]?.method === 'PUT') {
                window.__saveAttempts += 1;
                if (window.__saveAttempts === 1) {
                    throw new TypeError('Falha temporária simulada.');
                }
            }
            const response = await originalFetch(...args);
            if (String(args[0]).includes('/api/promotion/pdf')) {
                const bytes = new Uint8Array(await response.clone().arrayBuffer());
                window.__pdfTest = {
                    ok: response.ok,
                    contentType: response.headers.get('content-type'),
                    size: bytes.length,
                    prefix: String.fromCharCode(...bytes.slice(0, 5)),
                };
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            return response;
        };
    JS);
    $page
        ->assertSee('Gerar PDF')
        ->assertButtonEnabled('Gerar PDF')
        ->attach('input[aria-label="file upload"]', $fixture)
        ->assertSee('Ajuste a imagem')
        ->assertButtonEnabled('Cortar e Salvar')
        ->click('Cortar e Salvar')
        ->assertSee('Preço de atacado')
        ->click('Gerar PDF')
        ->assertSee('Preencha o preço de atacado de todos os produtos.')
        ->assertVisible('@error-toast')
        ->assertPresent('.product-row.has-price-error')
        ->assertPresent('.price-input.has-error')
        ->assertAttribute('input[aria-invalid="true"]', 'aria-invalid', 'true')
        ->fill('.price-input input', '10000')
        ->assertValue('.price-input input', '100,00')
        ->assertButtonEnabled('Gerar PDF')
        ->click('Gerar PDF')
        ->assertSee('Gerando')
        ->assertVisible('@pdf-spinner')
        ->assertSee('PDF gerado e baixado.')
        ->assertNoJavaScriptErrors();

    $pdf = $page->script('window.__pdfTest');
    expect($pdf)->toMatchArray([
        'ok' => true,
        'contentType' => 'application/pdf',
        'prefix' => '%PDF-',
    ]);
    expect($pdf['size'] ?? 0)->toBeGreaterThan(1000);

    $download = $page->script('window.__pdfDownload');
    expect($download)->toMatchArray([
        'connected' => true,
        'download' => 'promocao-cronicas.pdf',
    ]);
    expect($download['href'] ?? '')->toStartWith('blob:');
    expect($page->script('window.__saveAttempts'))->toBe(2);
});
