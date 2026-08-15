# Planejamento de implementação — MVP de promoções

## Objetivo

Evoluir o gerador atual de encartes em um MVP de SaaS para lojistas criarem, reutilizarem e exportarem promoções com a identidade visual da própria loja.

O MVP deve responder a uma pergunta simples: **uma loja consegue produzir e reutilizar promoções visualmente boas em poucos minutos, toda semana?**

O foco inicial é a criação e a exportação de material promocional. Catálogo público, pedidos, métricas, IA e integrações ficam para etapas posteriores.

## Princípios do produto

- **Personalização guiada:** a loja reconhece sua marca no material, sem precisar operar um editor complexo ou conseguir criar um visual ruim.
- **Mobile-first:** a criação e a revisão devem funcionar bem no celular, pois ele é o dispositivo de trabalho de muitos lojistas.
- **Reuso antes de criação:** duplicar a promoção anterior e trocar ofertas precisa ser mais rápido que começar do zero.
- **Poucos caminhos bem resolvidos:** temas, paletas e grids são presets curados, não uma tela de configuração infinita.
- **Exportação confiável:** o material final deve ter aparência consistente em PDF e imagem compartilhável.

## Escopo do MVP

### Incluído

- Perfil de uma loja com nome e logo.
- Três temas visuais, cada um com paletas predefinidas.
- Múltiplas promoções por loja, com várias páginas e produtos.
- Rascunho, publicação, encerramento, arquivamento e duplicação de promoções.
- Três modelos de grid por página.
- Exportação em PDF e JPG por página, além de uma imagem de capa opcional.
- Preservação do editor de fotos, controle de versão e histórico já existentes, adaptados ao novo modelo de dados.

### Fora do escopo do MVP

- Catálogo público com link de compra.
- Carrinho, pedidos e integração com WhatsApp.
- Dashboard de métricas.
- Pagamentos e assinaturas.
- Vários usuários, papéis e colaboração por equipe.
- Geração automática de paleta por IA ou logo.
- Editor livre de cores, fontes, espaçamentos ou posicionamento de elementos.
- Integrações com ERP, estoque, redes sociais ou API do WhatsApp.

## Decisões de produto já definidas

| Assunto | Decisão para o MVP | Motivo |
| --- | --- | --- |
| Formato de imagem | JPG como padrão de download | É o formato mais seguro para compartilhamento e publicação futura; PNG pode ser oferecido depois para casos de transparência/qualidade. |
| WebP | Uso interno opcional, não como exportação principal | WebP é excelente para web, mas JPG evita incompatibilidades em fluxos de compartilhamento. |
| Temas | 3 temas curados | Cria variedade sem multiplicar manutenção e decisões para o usuário. |
| Paletas | 3–4 opções aprovadas por tema | Mantém contraste, leitura e coerência visual. |
| Grids | 3 presets por página | Resolve os cenários mais comuns sem virar um editor de diagramação. |
| Produtos | Permanecem ligados à promoção nesta fase | Uma biblioteca global de produtos pode ser avaliada após validar o reuso via duplicação. |
| PDF | Continua como exportação central | Atende impressão, envio como arquivo e uso operacional já existente. |

## Modelo de domínio alvo

```text
Loja
 ├─ nome
 ├─ logo
 ├─ tema e paleta padrão
 └─ Promoções
     ├─ título, subtítulo, validade e status
     ├─ tema/paleta (herdados da loja, com opção de sobrescrever)
     ├─ páginas
     │   ├─ ordem
     │   ├─ grid
     │   └─ produtos
     ├─ versões salvas
     └─ exports
         ├─ PDF
         ├─ JPG de cada página
         └─ JPG de capa de compartilhamento
```

### Entidades e campos iniciais

| Entidade | Campos essenciais |
| --- | --- |
| `Store` | `id`, `name`, `logoPath`, `defaultTheme`, `defaultPalette`, `createdAt`, `updatedAt` |
| `Promotion` | `id`, `storeId`, `title`, `subtitle`, `note`, `badgeText`, `hashtag`, `startsAt`, `endsAt`, `status`, `theme`, `palette`, `version`, timestamps |
| `PromotionPage` | `id`, `promotionId`, `position`, `grid`, timestamps |
| `Product` | `id`, `promotionPageId`, `imagePath`, `name`, `wholesalePriceCents`, `position`, `isHighlighted`, timestamps |
| `PromotionHistory` | `id`, `promotionId`, `promotionVersion`, `snapshot`, `createdAt` |
| `PromotionExport` | `id`, `promotionId`, `kind`, `format`, `pageNumber`, `path`, `createdAt` |

`Product` pode ganhar uma relação opcional com uma futura biblioteca de produtos, mas isso não deve bloquear o MVP.

## Etapa 0 — Fundamentos e preparação

### Objetivo

Preparar a aplicação atual para sair do modelo de promoção única sem alterar sua experiência visual antes da hora.

### Implementação

1. Criar migrations para as entidades `Store`, `PromotionPage` e `PromotionExport`.
2. Migrar a promoção atual para uma loja padrão (`Crônicas`) e uma primeira promoção preservada.
3. Alterar as rotas e a persistência para aceitar um identificador de promoção em vez de usar sempre `id = 1`.
4. Definir contratos de API versionados ou estáveis para loja, lista de promoções, promoção individual e exports.
5. Manter SQLite durante o desenvolvimento/local; planejar PostgreSQL antes do primeiro ambiente multi-cliente em produção.
6. Criar fixtures e testes de migração para confirmar que nenhum dado existente é perdido.

### Critérios de aceite

- A promoção existente continua editável após a migration.
- A aplicação consegue abrir uma promoção pelo seu identificador.
- Não existem referências funcionais a uma promoção fixa no backend.
- A suíte atual de testes continua passando e há cobertura para a migration.

### Riscos e cuidados

- O controle de versão otimista deve passar a validar a versão da promoção correta.
- Uploads e arquivos temporários não podem usar nomes que colidam entre promoções.

## Etapa 1 — Perfil e identidade da loja

### Objetivo

Permitir que cada promoção saia com a marca da loja, sem abrir personalização descontrolada.

### Implementação

1. Criar uma tela ou seção "Minha loja" com nome e upload de logo.
2. Reutilizar o fluxo de upload/recorte de imagem existente para aceitar logo em PNG, JPG e WebP.
3. Gerar versões normalizadas do logo para uso em fundos claros e escuros, preservando a original.
4. Aplicar logo e nome automaticamente em novas promoções e exports.
5. Exibir um fallback tipográfico elegante se a loja ainda não tiver logo.
6. Definir limites de arquivo, dimensões mínimas e mensagem clara quando o logo for pouco legível.

### Critérios de aceite

- O usuário salva nome e logo, recarrega a página e os dados persistem.
- O logo aparece corretamente na prévia, no PDF e nas imagens exportadas.
- Uma promoção já existente passa a usar a identidade padrão da loja sem exigir edição manual.

## Etapa 2 — Sistema de temas e paletas curadas

### Objetivo

Dar identidade visual e opções suficientes para segmentos diferentes, preservando qualidade visual e legibilidade.

### Temas iniciais

| Tema | Direção visual | Uso típico |
| --- | --- | --- |
| `brutalista` | Atual, tipografia forte, blocos expressivos e contraste alto | Ofertas com personalidade e comunicação direta |
| `varejo` | Encarte de mercado moderno, foco em preço e leitura rápida | Mercados, conveniências, hortifrútis e atacado |
| `suave` | Contemporâneo, acolhedor e refinado | Beleza, moda, presentes, casa e negócios que preferem menor agressividade visual |

### Implementação

1. Transformar os valores visuais atuais em tokens por tema: fundo, superfícies, texto, preço, selo, bordas, sombras e tipografia.
2. Criar 3–4 paletas por tema, avaliadas com contraste mínimo para textos e preços.
3. Exibir a escolha como miniaturas com nomes descritivos, não como códigos de cor.
4. Definir `theme` e `palette` na loja como padrão e permitir sobrescrita por promoção.
5. Garantir que os componentes de página, produto e capa leiam apenas os tokens ativos.
6. Criar snapshots ou testes visuais para cada combinação de tema, paleta e grid.

### Critérios de aceite

- Trocar tema ou paleta atualiza a prévia sem corromper os dados da promoção.
- Todas as combinações aprovadas têm preço e textos legíveis.
- Um tema selecionado aparece igual na prévia, no PDF e no JPG.

### Não implementar nesta etapa

- Seletor livre de cores.
- Alteração de fontes pelo usuário.
- Geração de paleta baseada no logo.

## Etapa 3 — Múltiplas promoções e ciclo de vida

### Objetivo

Permitir que uma loja mantenha histórico e trabalhe semanalmente sem perder material anterior.

### Implementação

1. Criar uma tela de listagem de promoções com título, validade, status, última edição e miniatura.
2. Criar ações: nova promoção, abrir, duplicar, arquivar e excluir rascunho vazio.
3. Ao criar, iniciar com tema e paleta padrão da loja.
4. Ao duplicar, copiar conteúdo, páginas e referências de imagens; criar nova promoção em `rascunho` sem copiar exports nem histórico.
5. Adicionar campos opcionais de início e fim de validade.
6. Implementar estados: `draft`, `published`, `ended` e `archived`.
7. Manter o histórico de versões por promoção, em vez de mantê-lo globalmente.

### Critérios de aceite

- É possível manter e editar duas ou mais promoções sem mistura de dados.
- Duplicar uma promoção preserva conteúdo e layout, mas a nova promoção é independente.
- Arquivar não apaga dados nem exports; a promoção pode ser reaberta.
- Uma promoção publicada pode ser marcada como encerrada sem bloquear exportações do histórico.

## Etapa 4 — Páginas e grids curados

### Objetivo

Criar encartes mais interessantes visualmente sem exigir montagem manual.

### Grids iniciais

| Identificador | Composição | Capacidade sugerida |
| --- | --- | --- |
| `classic` | Grade uniforme de duas colunas | 4–6 produtos |
| `feature-left` | Um produto em destaque à esquerda e itens menores à direita/abaixo | 3–5 produtos |
| `feature-top` | Um destaque horizontal no topo e grade abaixo | 3–7 produtos |

As capacidades são guias de legibilidade. A interface deve impedir combinações que comprimam nomes, fotos ou preços além de um tamanho aceitável.

### Implementação

1. Criar `PromotionPage` e mover a ordenação de produtos para o contexto da página.
2. Incluir no editor ações para adicionar página, reordenar página, selecionar grid e mover produtos entre páginas.
3. Incluir a ação "marcar como destaque" quando o grid tiver posição de destaque.
4. Ajustar a prévia A4 para renderizar páginas reais e quebrar PDF por página salva.
5. Criar regras de validação por grid: mínimo/máximo de produtos, obrigatoriedade de destaque e ordenação.
6. Conservar margens e zonas de segurança iguais nos três temas; a diferença deve estar nos tokens visuais e não na legibilidade.

### Critérios de aceite

- Uma promoção pode ter várias páginas com grids diferentes.
- O produto destacado aparece na área correta no editor e no export.
- Não é possível exportar uma página que exceda a capacidade segura do grid.
- A ordem das páginas e dos produtos permanece idêntica no PDF.

## Etapa 5 — Exportação de PDF e imagem

### Objetivo

Entregar arquivos prontos para imprimir e compartilhar sem exigir conversão externa.

### Entregas

1. **PDF da promoção completa:** todas as páginas em A4, mantendo a geração atual.
2. **JPG por página:** arquivo de alta qualidade para compartilhar como imagem em WhatsApp e redes sociais.
3. **Capa de compartilhamento opcional:** imagem com marca, validade, chamada e até quatro produtos escolhidos pelo usuário.

### Implementação

1. Extrair a renderização da página em um componente/modo determinístico, utilizado tanto pela prévia quanto pelos exports.
2. Usar renderização no navegador headless para produzir PDF e JPG com dimensões explícitas.
3. Definir tamanhos iniciais:
   - página/encarte: proporção A4, resolução adequada para leitura e impressão;
   - capa de compartilhamento: 1080 × 1350 (formato vertical 4:5).
4. Salvar exports como registros de `PromotionExport`, com referência à promoção e à página quando aplicável.
5. Exibir lista de arquivos gerados, com download e data de geração.
6. Regenerar exports sob demanda, sem apagar exports anteriores até que a política de retenção seja definida.

### Critérios de aceite

- A promoção completa pode ser baixada em PDF.
- Cada página pode ser baixada em JPG.
- O JPG mantém textos e preços legíveis em um celular comum.
- Tema, logo, paleta, grid e ordem de conteúdo são consistentes entre prévia, PDF e JPG.
- Falhas de renderização não deixam arquivos incompletos publicados como concluídos.

### Nota sobre formatos

JPG é a exportação padrão. PNG poderá ser incluído como opção de alta fidelidade se testes reais mostrarem necessidade. WebP pode ser útil para imagens internas de um futuro catálogo web, mas não deve ser o formato de download principal no MVP.

## Etapa 6 — Qualidade, segurança e validação piloto

### Objetivo

Preparar a primeira versão para uso por lojas reais e obter sinais de retenção.

### Implementação

1. Adaptar os testes unitários e de navegador para múltiplas promoções, temas, grids e exports.
2. Criar testes de regressão visual para combinações-chave de temas e layouts.
3. Validar tamanho e tipo de arquivos enviados; remover metadados desnecessários de imagens exportadas.
4. Criar rotina de backup para banco e uploads; documentar restauração.
5. Inserir logs de erros de exportação e upload com contexto da promoção, sem registrar dados sensíveis desnecessários.
6. Fazer um piloto acompanhado com 5–10 lojas de um segmento inicial.
7. Registrar, por entrevista e observação, tempo para primeira promoção, frequência de uso, pedidos de suporte e motivo de não reutilização.

### Métricas de validação do MVP

| Sinal | Pergunta respondida |
| --- | --- |
| Tempo até primeiro export | A ferramenta é rápida o bastante para o fluxo real? |
| Promoções criadas por loja/semana | Ela entrou na rotina do cliente? |
| Taxa de duplicação | O reuso está funcionando? |
| Tema/grid mais escolhidos | Quais caminhos merecem aprofundamento? |
| Erros e abandonos no editor | Onde a experiência precisa de simplificação? |
| Intenção ou conversão para pagamento | O problema é valioso o bastante para vender? |

### Critérios de saída do MVP

- Lojas-piloto conseguem criar e exportar promoções sem assistência constante.
- Há uso recorrente por pelo menos parte do grupo durante algumas semanas.
- Existe evidência clara sobre segmento, preço percebido e funcionalidades que bloqueiam adoção.

## Próximas etapas, após validação

Estas etapas não devem ser iniciadas antes de haver sinais de uso recorrente do MVP.

### Fase 2 — Catálogo público e compartilhamento

- Link público único por promoção.
- Página mobile com produtos, validade e identidade da loja.
- Capa de compartilhamento com CTA e QR code.
- Links rastreáveis por canal.

### Fase 3 — Pedidos sem pagamento

- Seleção de produtos e quantidades pelo cliente.
- Resumo do pedido enviado para WhatsApp.
- Painel de pedidos com status: novo, em separação, pronto, concluído e cancelado.
- Política de privacidade, retenção e exclusão de dados alinhadas à LGPD.

### Fase 4 — Métricas

- Visitas únicas por promoção e origem de tráfego.
- Produtos mais vistos e adicionados.
- Pedidos iniciados e enviados ao WhatsApp.
- Conversão de visita para intenção de pedido.

### Fase 5 — Expansão de personalização e operação

- Biblioteca reutilizável de produtos.
- Mais grids e templates por segmento.
- Paletas sugeridas a partir do logo, com revisão humana e regras de contraste.
- Usuários, equipes, permissões e colaboração.
- Integrações com WhatsApp, ERP/estoque e redes sociais.
- Assinaturas, limites por plano e white-label para agências.

## Ordem recomendada de execução

1. Etapa 0 — fundamentos e migration.
2. Etapa 1 — perfil/identidade da loja.
3. Etapa 3 — múltiplas promoções e duplicação.
4. Etapa 2 — temas e paletas.
5. Etapa 4 — páginas e grids.
6. Etapa 5 — exports de JPG e PDF.
7. Etapa 6 — piloto e aprendizado.

Essa ordem reduz risco: primeiro garante o modelo de dados e o fluxo recorrente; depois amplia a qualidade visual; por fim consolida as entregas de exportação e testa o valor com clientes reais.
