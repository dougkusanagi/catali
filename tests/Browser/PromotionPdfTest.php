<?php

test('a user can generate a PDF from the editor', function () {
    $url = rtrim(getenv('E2E_APP_URL') ?: 'http://127.0.0.1:5199', '/');

    visit($url)
        ->assertSee('Gerar PDF')
        ->assertButtonEnabled('Gerar PDF')
        ->click('Gerar PDF')
        ->assertSee('PDF gerado e baixado.')
        ->assertNoJavaScriptErrors();
});
