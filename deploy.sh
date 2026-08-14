#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/var/www/promo-pdf}"
RELEASE_DIR="${APP_ROOT}/current"
SERVICE_NAME="promo-pdf"

export PATH="/root/.vite-plus/bin:/root/.bun/bin:/usr/local/bin:${PATH}"

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
if [[ ! -f .env ]]; then
    cat > .env <<'EOF'
DATABASE_URL="file:./storage/database.db"
PORT=3001
APP_URL="http://127.0.0.1:3001"
EOF
    chmod 0640 .env
fi
bunx --bun prisma migrate deploy
bunx --bun prisma generate

echo "Instalando Chromium para geração de PDF..."
bunx playwright install chromium

echo "Compilando assets com Vite+..."
vp build

echo "Instalando unidade systemd..."
BUN_BIN="$(command -v bun)"
sed "s|__BUN_BIN__|${BUN_BIN}|g" deploy/promo-pdf.service > "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl restart "${SERVICE_NAME}.service"

echo "Configurando Caddy..."
install -d -m 0755 /etc/caddy/sites.d
install -m 0644 deploy/Caddyfile /etc/caddy/sites.d/promo-pdf.caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "Deploy concluído em ${RELEASE_DIR}."
