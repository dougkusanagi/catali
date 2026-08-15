#!/usr/bin/env bash

set -Eeuo pipefail

dev_log="$(mktemp)"
test_root="$(mktemp -d)"
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
    setsid "$(type -P vp)" dev --host 127.0.0.1 --port 5199 >"${dev_log}" 2>&1 &
dev_pid=$!

for attempt in $(seq 1 60); do
    if curl --silent --fail --max-time 2 http://127.0.0.1:5199/ >/dev/null; then
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

E2E_APP_URL="${E2E_APP_URL:-http://127.0.0.1:5199}" \
PDF_TEST_URL="${PDF_TEST_URL:-http://127.0.0.1:3001}" \
    ./vendor/bin/pest tests/Feature/PdfGenerationTest.php tests/Browser/PromotionPdfTest.php --no-tia "$@"
