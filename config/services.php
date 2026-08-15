<?php

return [
    'pdf' => [
        'app_url' => env('PDF_APP_URL'),
        'runtime_bin' => env('PDF_RUNTIME_BIN'),
        'chromium_bin' => env('CHROMIUM_BIN'),
        'no_sandbox' => (bool) env('CHROMIUM_NO_SANDBOX', false),
    ],
];
