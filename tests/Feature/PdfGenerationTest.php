<?php

test('the PHP endpoint returns a real PDF', function () {
    $url = rtrim(getenv('PDF_TEST_URL') ?: (getenv('E2E_APP_URL') ?: 'http://127.0.0.1:5199'), '/').'/api/promotion/pdf';
    $context = stream_context_create([
        'http' => [
            'ignore_errors' => true,
            'timeout' => 120,
        ],
    ]);
    $pdf = file_get_contents($url, false, $context);

    expect($pdf)->toBeString()->not->toBeEmpty();
    expect($http_response_header[0] ?? '')->toContain('200');
    expect(substr($pdf, 0, 5))->toBe('%PDF-');
    expect(strlen($pdf))->toBeGreaterThan(1000);
});
