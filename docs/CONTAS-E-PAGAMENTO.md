# Contas com senha e acesso anual

## Estado atual

O código está preparado para Supabase Auth (e-mail e senha), banco PostgreSQL e fotos em Storage privado. A interface de contas só é ativada quando o build recebe a URL e a chave **pública** do projeto. Sem essas variáveis, o aplicativo atual continua local. Não é um sistema de assinatura ativo enquanto a configuração e os testes reais abaixo não forem concluídos.

A validação inicial pode usar os planos gratuitos, dentro das franquias vigentes. Não há garantia de custo zero: armazenamento, tráfego de fotos, e-mails e vendas podem ser cobrados pelos fornecedores. Configure alertas de consumo e consulte os limites antes de vender acesso.

## 1. Criar o projeto gratuito no Supabase

1. Crie um projeto em https://supabase.com/dashboard. Guarde a senha do banco no seu gerenciador de senhas, nunca no chat nem no código.
2. Nas configurações de API, copie a URL do projeto e a chave **publishable** (`sb_publishable_…`). Essas duas informações são públicas; a chave `service_role` nunca deve ir para o aplicativo, GitHub Pages ou variáveis de build.
3. No SQL Editor, execute `supabase/migrations/202611120001_accounts.sql` uma única vez. Ela cria os dados privados, as regras por usuário e o bucket privado `dream-images`.
4. Em Authentication, habilite e-mail/senha, confirmação do e-mail e senha de pelo menos 10 caracteres. A criação de conta não libera compra: o servidor também exige um pagamento aprovado para aquele e-mail.
5. Configure Site URL e os redirecionamentos para `https://jenniferdasilvaalmeida122-dot.github.io/habitkit-app/`. Não use curingas amplos em produção.
6. Configure o envio de e-mails de confirmação e recuperação. O serviço padrão do Supabase tem restrições para uso de produção; use um serviço SMTP compatível, considerando sua franquia e remetente verificado. São e-mails ocasionais; o login normal usa senha, sem códigos.

## 2. Conectar a Cakto (ainda precisa de validação do formato real)

A documentação `docs.cakto.com.br` foi bloqueada pela rede durante a implementação. **Nenhum formato de evento foi presumido como sendo o real da Cakto.** O endpoint recusa integração incompleta. A configuração precisa ser conferida com os eventos e o mecanismo de autenticação atuais do produto no painel da Cakto antes da ativação.

- Produto fixado no SQL: `69f774eb-5832-4dc6-9133-91f4455a8a5b`, informado pelo proprietário. `account_access()` e `apply_payment_event()` só aceitam esse produto, a partir da configuração protegida `vision_planner_config`.
- Confirme os eventos de pagamento aprovado, reembolso e chargeback e use o mesmo ID em `CAKTO_PRODUCT_IDS`.
- Obtenha um exemplo real sem dados pessoais e sem segredos para conferir o mapeamento. Não cole credenciais em chat, código ou issues.
- O adaptador atual suporta um segredo compartilhado em cabeçalho ou campo do payload. Só use essa opção se ela corresponder ao protocolo oficial da Cakto. Se o produto usar assinatura HMAC, configure a verificação específica antes de habilitar: não substitua HMAC por comparação de um campo arbitrário.
- Cadastre os valores em **Supabase Edge Function Secrets**, não no frontend:
  - `CAKTO_AUTH_MODE`: `shared-secret`, somente se o protocolo oficial confirmado usar segredo compartilhado. Sem modo compatível a função retorna 503. HMAC não é aceito por este adaptador.
  - `CAKTO_WEBHOOK_SECRET`: segredo de pelo menos 32 caracteres para o protocolo confirmado.
  - `CAKTO_PRODUCT_IDS`: IDs exatos dos produtos autorizados, separados por vírgula.
  - `CAKTO_EVENT_MAPPING`: JSON com os caminhos exatos de `event`, `eventId`, `orderId`, `productId`, `email`, `paidAt`, os três grupos em `events` e apenas um de `secretHeader`/`secretPath`.
- `paidAt` deve ser a data original do pagamento com fuso horário. Não use a data de recebimento do webhook, que mudaria a validade em reenvios.
- Exemplo **sintético para testes**, NÃO copiar como configuração Cakto:

```json
{
  "secretHeader": "x-example-secret",
  "event": "kind",
  "eventId": "eventId",
  "orderId": "order.id",
  "productId": "order.product",
  "email": "order.email",
  "paidAt": "order.paidAt",
  "events": {
    "approved": ["example_paid"],
    "refunded": ["example_refunded"],
    "chargeback": ["example_chargeback"]
  }
}
```

Publique a função `cakto-webhook` com Supabase CLI autenticado e o projeto correto:

```sh
supabase link --project-ref SEU_PROJECT_REF
supabase db push
supabase functions deploy cakto-webhook --no-verify-jwt
```

Se já aplicou a migração pelo SQL Editor, alinhe o histórico de migrações antes de `db push` ou use apenas o deploy da função; não execute a mesma migração duas vezes. O endpoint não recebe JWT de usuário da Cakto; o segredo/protocolo do webhook é obrigatório mesmo com `verify_jwt = false`.

Cadastre a URL HTTPS da função no produto da Cakto. Faça uma compra de teste e seu reembolso. Confira no banco os eventos e os acessos. Nenhum usuário do navegador pode escrever ou ler a tabela de pagamentos. O segredo service-role é usado apenas na função, pelo ambiente do Supabase.

### Regras do acesso

- Um pagamento aprovado concede um ano a partir da data real do pagamento, usando intervalo de calendário no banco.
- A pessoa entra com o e-mail confirmado e correspondente à compra.
- Eventos repetidos com os mesmos dados não estendem a validade. Reutilizar a chave de um evento com dados diferentes é recusado por fingerprint SHA-256. Datas infinitas são recusadas e pagamentos com data futura não liberam acesso antes de sua data. Reembolso ou chargeback vence uma aprovação atrasada da mesma compra.
- Outros produtos e eventos não mapeados são ignorados.
- Cancelar uma renovação futura não deve remover o período já pago. Não mapeie cancelamento genérico como reembolso.
- Esta primeira versão considera um ano por compra; não soma antecipadamente períodos de compras feitas antes do vencimento. Confira a política de renovação antes de vender renovação antecipada.
- O banco e o Storage verificam validade e revogação em cada acesso. O app confere novamente a cada minuto. Falha de rede impede continuar a sessão online, mas mantém alterações locais para exportar.
- Não há como apagar cópias, backups ou capturas que alguém já tenha baixado. O site estático é público; o que o servidor protege são os dados e recursos da conta.

## 3. Ativar o frontend (somente após os testes reais)

Nas variáveis do repositório do GitHub, cadastre:

- `HABITKIT_SUPABASE_URL`: URL HTTPS `https://…supabase.co`, sem barra final.
- `HABITKIT_SUPABASE_PUBLISHABLE_KEY`: chave `sb_publishable_…`.

O workflow lê apenas essas variáveis públicas e gera a configuração de produção. Segredos de banco, Cakto e SMTP não pertencem ao GitHub Pages. Com apenas uma das variáveis, o build falha para evitar configuração parcial.

O workflow preparado consulta `/auth/v1/settings` em modo somente leitura antes do build. Ele verifica URL/chave pública, e-mail/senha e confirmação do e-mail; isso não aplica o SQL nem valida sozinho as políticas do banco. Execute uma nova publicação somente depois de configurar e testar o backend e de autorizar a publicação. Ainda não foi publicado/ativado por esta implementação. O rollback para modo local não é uma política de controle de assinatura: não use o frontend sem contas como versão comercial protegida.

## Dados antigos, fotos e uso em vários aparelhos

- Os dados anteriores sem conta continuam no navegador original. Nada é importado automaticamente para a primeira pessoa que entrar.
- Uma conta nova oferece importar os dados deste aparelho ou começar vazia. Importe apenas os seus próprios dados.
- Hábitos e IndexedDB têm nomes separados por ID de usuário. Ao entrar, a versão da conta é carregada; sessões diferentes não compartilham o cache local.
- Em alteração simultânea em dois aparelhos, o servidor recusa sobrescrever uma versão mais recente. O app permite exportar as alterações locais antes de carregar a versão da conta.
- Fotos ficam em bucket **privado**, com objetos imutáveis e caminhos por usuário e hash. Não são duplicadas a cada gravação. O tratamento e a qualidade dos uploads permanecem como no aplicativo atual; esta integração não altera recorte, proporção nem resolução das imagens.
- Limites iniciais: até 8 MB por imagem e 3 MB de metadados por workspace, além dos limites já existentes no app. Isso não é um teto total de gastos. Fotos antigas não referenciadas ainda ocupam Storage; antes de crescer, programe uma limpeza segura no servidor e política de exclusão de conta. Não apague arquivos usados por um backup sem uma política definida.
- A sincronização é feita ao salvar e ao entrar/recarregar. Não é colaboração em tempo real. Falhas mantêm cópia local e exibem aviso; o app não afirma que um salvamento falho foi concluído.

## Validação antes de oferecer a clientes

1. Usuário A pago entra, cria hábito e salva foto. Após nova sessão, os dados voltam da conta.
2. Usuário B não consegue ler workspace nem imagens de A, inclusive por acesso direto às APIs.
3. Conta sem pagamento, expirada ou sem confirmação de e-mail não lê nem grava dados.
4. Reenvio do webhook não renova o período. Reembolso/chargeback bloqueia acesso; aprovação atrasada não reativa a compra estornada.
5. Link de recuperação troca a senha. Senhas e tokens não aparecem em logs.
6. Dois aparelhos salvando simultaneamente geram conflito explícito, sem apagar alterações em silêncio.
7. Confirme e-mails reais, limites, datas, produto, imagem privada e assinatura/autenticação oficial da Cakto num projeto de teste antes de produção.

Os testes locais usam simulações de Auth/Storage e PostgreSQL de teste. Eles não substituem os testes com Supabase e Cakto reais.

## Executar testes locais

```sh
npm test
npm run build
python3 tests/accounts-browser.py
python3 tests/category-folders.py
python3 tests/vision-favorites.py
python3 tests/alter-ego-browser.py
python3 tests/production.py
```

O teste SQL usa PostgreSQL via PGlite, instalado fora do projeto para não criar dependências no app:

```sh
npm install --prefix /tmp/habitkit-sql-check --no-package-lock --no-audit --no-fund @electric-sql/pglite
node tests/accounts-sql.mjs
```

Os schemas Auth e Storage no teste SQL são representativos; a implementação gerenciada do Supabase e a entrega real da Cakto ainda precisam de testes no projeto configurado.
