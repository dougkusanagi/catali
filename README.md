# Gerador de promoções Crônicas

MVP SaaS mobile-first para uma loja criar, reutilizar e exportar promoções com sua própria identidade.
O frontend é React/Vite+ e o backend foi migrado para Laravel 13, com Eloquent e SQLite no desenvolvimento.

O MVP inclui:

- perfil da loja com nome, logo, tema e paleta padrão;
- múltiplas promoções com rascunho, publicação, encerramento, arquivamento e duplicação;
- páginas com grids `classic`, `feature-left` e `feature-top`;
- editor de fotos, nomes opcionais, destaque de produto e controle de versão por promoção;
- PDF completo, JPG por página, capa vertical 4:5 e histórico de exports;
- migração compatível com o SQLite usado pela versão anterior, sem perder promoções ou produtos.

## Executar localmente

Requisitos: PHP 8.4+, Composer, Bun/Vite+, Node/Bun e Chromium do Playwright.

```bash
composer install
vp install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
bunx playwright install chromium
vp dev --host 0.0.0.0 --port 5199
```

Abra `http://localhost:5199`. O `vp dev` inicia o Vite com HMR na porta 5199 e o Laravel em uma
porta auxiliar (3001 por padrão). O proxy encaminha `/api` e `/uploads` para o Laravel.

Para uma instalação já existente, `php artisan migrate --force` executa a migration Laravel e adapta
as tabelas legadas `Store`, `Promotion`, `Product`, `PromotionPage`, `PromotionHistory` e
`PromotionExport`. A primeira promoção e a loja padrão são garantidas por `php artisan db:seed`.

## Contratos de API

Os endpoints principais são:

```text
GET/PUT  /api/store
GET/POST /api/promotions
GET/PUT/DELETE /api/promotions/:id
POST     /api/promotions/:id/duplicate
PATCH    /api/promotions/:id/status
GET      /api/promotions/:id/history
GET      /api/promotions/:id/exports
GET      /api/promotions/:id/pdf
GET      /api/promotions/:id/exports/jpg?page=1
GET      /api/promotions/:id/exports/cover
POST     /api/uploads
```

Os aliases `/api/promotion`, `/api/promotion/history` e `/api/promotion/pdf` continuam disponíveis
para clientes antigos do editor.

## Testes

```bash
composer install
vp install
bunx playwright install chromium
E2E_VITE_PORT=5299 E2E_PHP_PORT=5301 ./scripts/test-e2e.sh
./vendor/bin/pest tests/Unit --no-coverage
```

O script E2E cria um banco SQLite temporário, executa migrations e seeders Laravel, sobe Vite +
Laravel e valida PDF e a jornada de upload/salvamento/exportação no navegador. As portas podem ser
omitidas quando 5199/3001 estiverem livres.

## Produção

O deploy usa Caddy + PHP-FPM e serve o frontend estático em `dist`, o entrypoint Laravel em `public`
e os uploads diretamente de `storage/uploads`:

```bash
sudo bash deploy.sh
```

O script instala Composer e frontend, gera `APP_KEY` quando necessário, executa
`php artisan migrate --force` e `php artisan db:seed --force`, prepara o Chromium para exportações e
configura `deploy/Caddyfile`. Defina `PHP_FPM_SOCK` se houver mais de uma versão do PHP instalada.

O banco SQLite fica em `storage/database.db`, os uploads em `storage/uploads` e os exports em
`storage/exports`; todos devem entrar na rotina de backup.
