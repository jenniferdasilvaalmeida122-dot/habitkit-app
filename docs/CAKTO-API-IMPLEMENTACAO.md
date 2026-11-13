# Cakto API — estado atualizado com os endpoints confirmados

## Já implementado diretamente no projeto

O proprietário forneceu os seguintes dados da documentação, agora configurados em `api-contract.mjs`:

- POST `https://api.cakto.com.br/public_api/token/`
- `Content-Type: application/x-www-form-urlencoded`
- Corpo: somente `client_id` e `client_secret`, obtidos de `CAKTO_CLIENT_ID` e `CAKTO_CLIENT_SECRET` nos Secrets do servidor.
- Resposta de token: `access_token`, `expires_in`, `token_type` e `scope`. O cliente usa token e validade; não presume o nome de um escopo que não foi informado. A permissão efetiva é conferida pela resposta da consulta do pedido.
- GET `https://api.cakto.com.br/public_api/orders/{id}/`
- Cabeçalho `Authorization: Bearer TOKEN`.
- Apenas status `paid` foi confirmado como pagamento concluído.

Não é pedido novamente nenhum desses dados. Não é necessária nova chave. As credenciais no Supabase não foram copiadas para o projeto nem estão acessíveis a este chat.

O cliente faz cache do token em memória, renova antes de expirar, coordena consultas concorrentes e tenta renovar uma vez em caso de 401. Respostas 404/403/429/5xx e falhas de rede não concedem acesso. Timeouts, limites de corpo e bloqueio de redirects impedem seguimento automático de credenciais para destinos diferentes.

## Como o modo inspect funciona agora

Permanece o modo padrão, sem chamadas a `apply_payment_event`.

Para um webhook autenticado com um item do produto configurado, a função obtém o token e consulta o ID financeiro pelo endpoint confirmado. Se a API responder 200, a extração financeira ainda não confirmada gera `cakto_order_fields_unconfirmed`. O log `cakto_inspect`, em `shapes[].api_shape`, mostra SOMENTE nomes/caminhos de campos e tipos: nunca o conteúdo de nomes, e-mails, documentos, tokens ou datas.

Exemplo ilustrativo de diagnóstico estrutural (não é afirmação sobre o schema real da Cakto):

```json
{"path":"data.customer.email","type":"string"}
```

Também são mostrados o ID de produto configurado e os IDs de produto recebidos, que não são credenciais. Itens de outro produto não são consultados como se fossem compras do Vision Planner.

- `target_count: 0`: nenhum item corresponde ao produto configurado. Verificar o produto e a estrutura do evento.
- `cakto_oauth_credentials_rejected`: conferir os Secrets existentes e a conta Cakto, sem expor valores.
- `cakto_order_access_denied`: conferir permissão de leitura de pedidos e vínculo com a conta vendedora.
- `cakto_order_not_found`: pedido não encontrado; não é autorização para conceder acesso. Pode ser teste fictício, ID incorreto ou pedido não visível para essa credencial.
- `cakto_order_fields_unconfirmed`: token e consulta chegaram a uma resposta JSON 200, mas ainda não há extração validada para autorizar a compra.
- `verified_production_payment_no_grant`: só poderá ocorrer depois de implementar a extração/prova real. Mesmo assim, inspect não grava acesso.

## Campos que ainda precisam ser confirmados — somente estes

O webhook não substitui a resposta de **Obter Pedido**. Precisamos confirmar o caminho exato e o significado de:

| Informação | O que falta saber na resposta da API |
|---|---|
| Envelope | Objeto raiz, `data`, outro envelope ou lista? |
| ID financeiro | Campo que corresponde ao ID do pedido consultado e do pagamento original. Não usar ID da assinatura como substituto. |
| Produto | Campo que contém `69f774eb-5832-4dc6-9133-91f4455a8a5b`. |
| Comprador | Caminho do e-mail que receberá o acesso; a API deve confirmar o mesmo comprador do evento. |
| Estado | Caminho do status; valor pago confirmado: `paid`. Valores reais de estorno/chargeback ainda faltam. |
| Data do pagamento | Campo e formato da data original, com fuso. Não usar data de criação ou de recebimento como alternativa. |
| Estorno/chargeback | Estado/datas/identificadores que comprovam a situação atual e a transação original afetada. |
| Produção versus teste | Campo e valores documentados, ou garantia documentada de que esse endpoint/credencial só pode consultar transações reais. Ausência de marcador não significa automaticamente produção. |
| Conta vendedora | Campo correspondente ao proprietário, ou garantia documentada de isolamento da API pelas credenciais OAuth2. |

Nenhum desses nomes foi adivinhado para liberar acesso. O método de normalização permanece bloqueado explicitamente, mesmo se alguém mudar o modo para live. As rotas confirmadas já estão configuradas; o ponto restante é interpretar a prova financeira corretamente.

## Eventos

Confirmados pelo proprietário: `purchase_approved`, `subscription_renewed`, `refund` e `chargeback`.

O identificador técnico de cancelamento ainda está pendente. O modo inspect já permite identificá-lo sem preencher mapa live. A outra opção de renovação do painel não deve ser interpretada como um segundo pagamento por semelhança do nome.

Cancelamento preserva o período pago; não concede período novo. Compra/renovação só liberam depois de uma consulta autenticada que comprove o pagamento real. Reembolso/chargeback da transação original prevalecem sobre uma aprovação atrasada. O período é calculado pelo SQL existente.

## Instalação do backend para diagnóstico seguro

Nenhuma implantação foi feita por esta sessão. O arquivo único gerado é `/workspace/downloads/cakto-webhook-api-inspect.ts`.

1. No Supabase, na função existente `cakto-webhook`, substitua o conteúdo de `index.ts` pelo arquivo completo, se desejar instalar a atualização de diagnóstico. Ele contém todos os módulos, sem imports.
2. Preserve os Secrets já criados: `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` e `CAKTO_WEBHOOK_SECRET`. Mantenha explicitamente `CAKTO_MODE=inspect`.
3. Preserve Verify JWT desativado somente para essa função: o segredo do webhook continua obrigatório e é validado pelo código.
4. Faça o deploy apenas desse backend pelo painel Supabase. Não é uma publicação do frontend/GitHub Pages.
5. Reenvie um webhook de uma venda real existente do produto correto, ou teste com um pedido real ao qual essa credencial tenha acesso. Não é necessário comprar novamente se já existir uma venda válida. O simulador com produto fictício continua sem liberar acesso e pode nem atingir a consulta por não corresponder ao produto.
6. Confira `api_check` e `api_shape` nos logs, sem publicar dados pessoais ou segredos.

## O que falta para concluir

- Uma resposta 200 real, com os campos acima e as garantias de produção/conta vendedora documentadas. A própria atualização inspect obtém a estrutura quando consulta um pedido real, sem gravar acesso.
- Preencher a normalização com essa evidência confirmada, então testar pedido real pago, não pago e estornado, além de um teste fictício.
- Confirmar cancelamento e relação dos IDs de renovação/reembolso com o pagamento original.
- Conferir duas contas distintas e repetir as validações de isolamento.
- Só depois disso e de autorização explícita considerar live. O estado atual NÃO está pronto para liberação automática.

## Evidência dos testes locais

`tests/cakto-api.test.mjs` verifica as URLs confirmadas, o corpo com exatamente dois campos, Bearer, cache, expiração, renovação de token, erros, segurança do diagnóstico e ausência de escrita com campos não confirmados. Os demais testes usam fixtures sintéticas para validar o tratamento de respostas financeiras. Isso não prova que a API real respondeu para as credenciais do Supabase: nenhum teste com essas credenciais foi feito neste chat.
