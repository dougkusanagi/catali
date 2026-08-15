#!/usr/bin/env bash

set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/var/www/promo-pdf}"
RELEASE_DIR="${APP_ROOT}/current"
PDF_APP_URL="${PDF_APP_URL:-https://promo-pdf.cronicasjeans.com.br}"

export PATH="/root/.vite-plus/bin:/root/.bun/bin:/usr/local/bin:${PATH}"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Execute este script como root."
    exit 1
fi

cd "${RELEASE_DIR}"

echo "Atualizando o código..."
if [[ -n "$(git status --porcelain)" ]]; then
    echo "O checkout possui alterações locais; deploy cancelado para não sobrescrevê-las."
    exit 1
fi
if ! git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
    echo "A branch atual não possui upstream configurado; deploy cancelado."
    exit 1
fi
git pull --ff-only

echo "Instalando Vite+ (vp), se necessário..."
if ! command -v vp >/dev/null 2>&1; then
    curl -fsSL https://vite.plus | bash
    export PATH="${HOME}/.vite-plus/bin:${HOME}/.bun/bin:${PATH}"
fi

if ! command -v php >/dev/null 2>&1; then
    echo "PHP não encontrado. Instale PHP-FPM e as extensões PDO SQLite/Fileinfo antes do deploy."
    exit 1
fi

echo "Instalando dependências..."
vp install --frozen-lockfile

echo "Preparando banco SQLite..."
mkdir -p storage/uploads storage/temp
chown -R www-data:www-data storage
if [[ ! -f .env ]]; then
    cat > .env <<'EOF'
DATABASE_URL="file:./storage/database.db"
PDF_APP_URL="https://promo-pdf.cronicasjeans.com.br"
EOF
    chmod 0640 .env
fi
chown root:www-data .env
chmod 0640 .env
php php/migrate.php

CHROMIUM_BIN="${CHROMIUM_BIN:-}"
if [[ -z "${CHROMIUM_BIN}" && -d /var/www/.cache/ms-playwright ]]; then
    CHROMIUM_BIN="$(find /var/www/.cache/ms-playwright -type f -name chrome-headless-shell -perm -u+x -print -quit)"
    CHROMIUM_BIN="${CHROMIUM_BIN:-$(find /var/www/.cache/ms-playwright -type f -name chrome -perm -u+x -print -quit)}"
fi
if [[ -z "${CHROMIUM_BIN}" ]]; then
    CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
fi
if [[ -z "${CHROMIUM_BIN}" ]]; then
    echo "Chromium não encontrado. Defina CHROMIUM_BIN e execute o deploy novamente."
    exit 1
fi
echo "Chromium encontrado em ${CHROMIUM_BIN}."

echo "Compilando assets com Vite+..."
vp build

PHP_FPM_SOCK="${PHP_FPM_SOCK:-}"
if [[ -z "${PHP_FPM_SOCK}" ]]; then
    PHP_FPM_SOCK="$(find /run/php -maxdepth 1 -type s -name 'php*-fpm.sock' -print -quit 2>/dev/null || true)"
fi
if [[ -z "${PHP_FPM_SOCK}" ]]; then
    echo "Socket do PHP-FPM não encontrado em /run/php. Defina PHP_FPM_SOCK e execute novamente."
    exit 1
fi

if systemctl is-active --quiet promo-pdf.service || systemctl is-enabled --quiet promo-pdf.service; then
    echo "Desativando o serviço Bun antigo..."
    systemctl disable --now promo-pdf.service || true
fi
if [[ -f /etc/systemd/system/promo-pdf.service ]]; then
    rm -f /etc/systemd/system/promo-pdf.service
    systemctl daemon-reload
fi

echo "Configurando Caddy..."
install -d -m 0755 /etc/caddy/sites.d
sed \
    -e "s|__APP_ROOT__|${RELEASE_DIR}|g" \
    -e "s|__PHP_FPM_SOCK__|${PHP_FPM_SOCK}|g" \
    deploy/Caddyfile > /etc/caddy/sites.d/promo-pdf.caddy
chmod 0644 /etc/caddy/sites.d/promo-pdf.caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "Deploy PHP-FPM concluído em ${RELEASE_DIR}. Nenhum serviço Bun foi instalado ou reiniciado."
