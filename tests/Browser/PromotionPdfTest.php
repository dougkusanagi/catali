<?php

use Symfony\Component\Process\Process;

test('a user can generate a PDF from the editor', function () {
    $url = getenv('E2E_APP_URL') ?: 'http://127.0.0.1:5199';
    $fixture = dirname(__DIR__, 2).'/public/logo-cronicas.png';
    $runtime = getenv('PDF_TEST_RUNTIME') ?: (PHP_OS_FAMILY === 'Windows' ? 'node.exe' : 'node');

    $process = new Process([$runtime, dirname(__DIR__, 2).'/scripts/test-browser.mjs', $url, $fixture], dirname(__DIR__, 2));
    $process->setTimeout(120);
    $process->run();

    expect($process->isSuccessful())->toBeTrue($process->getErrorOutput() ?: $process->getOutput());

    $result = json_decode(trim($process->getOutput()), true, flags: JSON_THROW_ON_ERROR);
    expect($result)->toMatchArray([
        'pdfOk' => true,
        'contentType' => 'application/pdf',
        'prefix' => '%PDF-',
        'download' => 'promocao-cronicas.pdf',
        'saveAttempts' => 2,
    ]);
    expect($result['size'] ?? 0)->toBeGreaterThan(1000);
});
