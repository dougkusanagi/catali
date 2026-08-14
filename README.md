# Gerador de promoções Crônicas

Editor React/Vite+ para montar promoções com fotos e preços de atacado, salvar em SQLite e baixar em PDF.

Cada foto adicionada cria um novo produto. O PDF mantém os produtos em uma grade fixa de duas colunas,
com até 6 produtos por página; acima disso, novas páginas são criadas automaticamente (limite de 24
produtos por promoção). É possível escolher uma imagem pela galeria, tirar uma foto ou arrastá-la para
a área de produtos.

## Executar

```bash
vp install
bun run db:migrate -- --name init
bun run db:seed
bunx playwright install chromium
bun run dev
```

Abra `http://localhost:5199`. O frontend usa a porta 5199 e a API Bun, a porta 3001.

## Produção

```bash
vp build
bun start
```

Configure `APP_URL` com a URL pública usada pelo navegador headless para renderizar o PDF. O banco fica em `storage/database.db` e as imagens em `storage/uploads`; ambos devem ser incluídos em sua rotina de backup.
