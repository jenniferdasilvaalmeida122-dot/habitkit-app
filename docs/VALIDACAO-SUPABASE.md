# Revisão da integração Supabase — 12/11/2026

## Workflow preparado, ainda não publicado

O arquivo `.github/workflows/deploy.yml` lê `vars.HABITKIT_SUPABASE_URL` e `vars.HABITKIT_SUPABASE_PUBLISHABLE_KEY` tanto na checagem de conexão quanto no build. A checagem consulta somente Auth Settings e verifica e-mail/senha, confirmação do e-mail e cadastro. Não aplica tabelas, não concede pagamentos e não confirma RLS real.

O build aceita somente chave `sb_publishable_`, normaliza a URL e rejeita chaves secretas/service-role e configurações parciais. Os valores públicos são colocados no arquivo de configuração do build; os arquivos-fonte não recebem credenciais reais.

A API do GitHub respondeu `Forbidden` à tentativa de consultar apenas os nomes das variáveis. Portanto, o conteúdo salvo pelo proprietário não foi verificado neste chat. Variáveis do GitHub Actions não são variáveis locais deste ambiente. Não foi disparado workflow, feito push ou publicada alteração.

## Testes executados e aprovados

- `npm test`: 25 testes, incluindo leitura dos nomes exatos das variáveis, geração do build com configuração pública sintética, rejeição de chave privada, preflight Auth, dados e webhook.
- `node tests/accounts-sql.mjs`: migração executada em PostgreSQL via PGlite, com schemas representativos de Supabase Auth e Storage. Duas contas pagantes isoladas, leitura anônima negada, imagem privada mesmo com políticas permissivas preexistentes, escrita direta negada, conflitos de revisão, duplicação de eventos, reembolso, aprovação atrasada e expiração.
- `python3 tests/accounts-browser.py`: Auth/Storage simulados; login, recuperação, importação explícita do legado, fotos privadas, troca de conta, conflito com exportação e revogação durante sessão.
- `python3 tests/category-folders.py` e `python3 tests/production.py`: pastas por categoria e fluxos existentes de hábitos, persistência, responsividade e arquivos de produção.
- `python3 tests/design-preservation.py`: página inicial e Vision Board visualmente idênticos ao HEAD publicado em 320, 390 e 1440 px, com contas ainda desativadas. A baseline foi gerada em `/tmp` a partir de `git archive HEAD`, sem alterar o checkout.
- `git diff --check`: aprovado.

A comparação visual se refere à página existente no modo local. A autenticação adiciona somente as telas de conta e informações da sessão quando ativada; não reformula o mural, hábitos ou marca.

## Limitações e próximos passos reais

Não há acesso administrativo ao projeto Supabase nesta sessão. Não foram executadas migrações, criadas usuárias ou configurados SMTP/URLs no serviço real. O fluxo e a autenticação oficial da Cakto continuam pendentes de validação com eventos reais.

Execute as etapas de [SUPABASE-PASSO-A-PASSO.md](SUPABASE-PASSO-A-PASSO.md). Antes de autorizar a publicação, é necessário concluir esses testes no projeto real, confirmar entrega de e-mail, isolamento de duas contas pagantes e aprovação/reembolso do produto anual. Os testes simulados não são prova de operação em produção.
