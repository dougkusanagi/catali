# Gerador de promoções Crônicas

Editor React/Vite+ para montar promoções com fotos e preços de atacado, salvar em SQLite e baixar em PDF.

Cada foto adicionada cria um novo produto. O PDF mantém os produtos em uma grade fixa de duas colunas,
com até 6 produtos por página; acima disso, novas páginas são criadas automaticamente (limite de 24
produtos por promoção). É possível escolher uma imagem pela galeria, tirar uma foto ou arrastá-la para
a área de produtos no desktop; no celular, toque nessa mesma área para abrir a galeria.

No editor de imagem, o zoom é feito com a pinça no celular (ou com o gesto equivalente no trackpad),
sem um limite artificial. A prévia A4 se ajusta à largura disponível e pode ser ampliada pelos controles
de zoom para conferir detalhes mantendo a mesma proporção do PDF final.

O editor aceita mais de uma pessoa na mesma promoção sem contas ou cadastro. O salvamento usa controle
de versão otimista: se outra pessoa salvar enquanto você edita, o banco recusa a gravação desatualizada,
preserva o rascunho no navegador e mostra as divergências. O rascunho pode então substituir a versão mais
recente de forma explícita, ou ser descartado em favor dela. O banco mantém as últimas 10 versões salvas.

## Executar

```bash
vp install
bun run db:migrate -- --name init
bun run db:seed
bunx playwright install chromium
bun run dev
```

Abra `http://localhost:5199`. O frontend usa a porta 5199 e a API Bun, a porta 3001.

### Testar a versão PHP-FPM localmente

O backend PHP usa o mesmo SQLite e os mesmos endpoints do frontend. Gere os assets e suba o
servidor embutido do PHP:

```bash
vp install
vp build
php php/migrate.php
PHP_CLI_SERVER_WORKERS=4 php -S 127.0.0.1:8080 php/router.php
```

Abra `http://127.0.0.1:8080`. Para gerar PDF localmente, instale o Chromium do Playwright (`bunx
playwright install chromium`) e deixe Node/Bun disponível para o processo pontual de renderização.
O endpoint PHP usa `page.pdf` com as mesmas opções do backend original; nenhum serviço Bun fica
rodando entre as requisições.

## Produção

O deploy PHP-FPM não instala nem mantém um serviço Bun. O Caddy serve o frontend estático, encaminha
`/api/*` para o socket do PHP-FPM e serve as imagens de `storage/uploads`:

```bash
sudo bash deploy.sh
```

Defina `PHP_FPM_SOCK` se houver mais de uma versão do PHP instalada. Se Node/Bun ou o Chromium não
estiverem em um caminho padrão, defina `PDF_RUNTIME_BIN` ou `CHROMIUM_BIN`. O banco fica em
`storage/database.db` e as imagens em `storage/uploads`; ambos devem ser incluídos em sua rotina de backup.
