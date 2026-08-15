#!/usr/bin/env bash

set -Eeuo pipefail

base_url="${PDF_APP_URL:-http://127.0.0.1:8080}"
output="$(mktemp)"
trap 'rm -f "${output}"' EXIT

curl --fail --silent --show-error --max-time 45 --output "${output}" "${base_url%/}/api/promotion/pdf"
[[ "$(head -c 5 "${output}")" == "%PDF-" ]]
[[ "$(wc -c < "${output}")" -gt 1000 ]]

echo "PDF gerado com sucesso ($(wc -c < "${output}") bytes)."
