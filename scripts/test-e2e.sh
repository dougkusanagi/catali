#!/usr/bin/env bash

set -Eeuo pipefail

dev_log="$(mktemp)"
test_root="$(mktemp -d)"
vite_port="${E2E_VITE_PORT:-5199}"
php_port="${E2E_PHP_PORT:-3001}"
dev_pid=""
cleanup() {
    if [[ -n "${dev_pid}" ]] && kill -0 "${dev_pid}" 2>/dev/null; then
        kill -- "-${dev_pid}" 2>/dev/null || true
        wait "${dev_pid}" 2>/dev/null || true
    fi
    rm -f "${dev_log}"
    rm -rf "${test_root}"
}
trap cleanup EXIT

DATABASE_URL="file:${test_root}/database.db" \
APP_ENV=testing \
APP_KEY="base64:eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=" \
DB_DATABASE="${test_root}/database.db" \
    php artisan migrate --force
DATABASE_URL="file:${test_root}/database.db" \
APP_ENV=testing \
APP_KEY="base64:eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=" \
DB_DATABASE="${test_root}/database.db" \
    php artisan db:seed --force

DATABASE_URL="file:${test_root}/database.db" \
PHP_DEV_PORT="${php_port}" \
    setsid "$(type -P vp)" dev --host 127.0.0.1 --port "${vite_port}" >"${dev_log}" 2>&1 &
dev_pid=$!

for attempt in $(seq 1 60); do
    if curl --silent --fail --max-time 2 "http://127.0.0.1:${vite_port}/" >/dev/null; then
        break
    fi
    if ! kill -0 "${dev_pid}" 2>/dev/null; then
        cat "${dev_log}"
        exit 1
    fi
    sleep 1
    if [[ "${attempt}" == 60 ]]; then
        cat "${dev_log}"
        echo "O servidor Vite não ficou disponível a tempo." >&2
        exit 1
    fi
done

E2E_APP_URL="${E2E_APP_URL:-http://127.0.0.1:${vite_port}}" \
PDF_TEST_URL="${PDF_TEST_URL:-http://127.0.0.1:${php_port}}" \
    ./vendor/bin/pest tests/Feature/PdfGenerationTest.php tests/Browser/PromotionPdfTest.php --no-tia "$@"
