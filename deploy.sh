#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/var/www/promo-pdf}"
RELEASE_DIR="${APP_ROOT}/current"
SERVICE_NAME="promo-pdf"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Execute este script como root."
    exit 1
fi

cd "${RELEASE_DIR}"

echo "Instalando Vite+ (vp), se necessário..."
if ! command -v vp >/dev/null 2>&1; then
    curl -fsSL https://vite.plus | bash
    export PATH="${HOME}/.vite-plus/bin:${HOME}/.bun/bin:${PATH}"
fi

if ! command -v bun >/dev/null 2>&1; then
    echo "Bun não encontrado. Instale Bun antes de executar o deploy."
    exit 1
fi

echo "Instalando dependências..."
vp install --frozen-lockfile

echo "Aplicando banco e gerando Prisma Client..."
mkdir -p storage/uploads storage/temp
chown -R www-data:www-data storage
bunx --bun prisma migrate deploy
bunx --bun prisma generate

echo "Compilando assets com Vite+..."
vp build

echo "Instalando unidade systemd..."
BUN_BIN="$(command -v bun)"
sed "s|__BUN_BIN__|${BUN_BIN}|g" deploy/promo-pdf.service > "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"

echo "Configurando Caddy..."
install -d -m 0755 /etc/caddy
install -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "Deploy concluído em ${RELEASE_DIR}."
