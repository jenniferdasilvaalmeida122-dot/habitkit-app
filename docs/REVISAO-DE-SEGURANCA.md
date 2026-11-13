# Revisão de segurança antes da primeira migração

## Resultado e alcance

Foi identificada e corrigida uma falha: a versão anterior de `account_access()` aceitava qualquer compra aprovada pelo e-mail, sem verificar `product_id`. Não execute a versão anterior. Use somente o SQL atualizado em `supabase/migrations/202611120001_accounts.sql`, integralmente de BEGIN a COMMIT.

A revisão abrangeu SQL, grants/RLS, funções com privilégios elevados, autenticação no frontend, isolamento do cache por conta, referências de imagens privadas e processamento do webhook. Os testes usam PostgreSQL de teste e serviços simulados; não houve execução de SQL no Supabase real, cadastro de webhook, alteração de design, push ou publicação.

## Produto correto, identificado pelo proprietário

O produto anual informado é `69f774eb-5832-4dc6-9133-91f4455a8a5b`.

- O ID é cadastrado em `public.vision_planner_config`, uma configuração de uma única linha sem acesso direto por `anon`, `authenticated` ou `service_role`.
- `account_access()` compara a compra com esse ID no banco. Produto diferente não libera dados, mesmo que exista um registro antigo aprovado para o mesmo e-mail.
- `apply_payment_event()` também recusa outro produto. A checagem não depende da lista de produtos do webhook.
- Configuração sem ID (NULL) bloqueia o acesso. Usuárias não conseguem ler ou alterar a configuração por API.
- O ID precisa ser o identificador do produto da Cakto, e não uma oferta ou o link do checkout. O valor foi fornecido pelo proprietário; ainda não foi conferido por API da Cakto.

## Funções SECURITY DEFINER

Todas têm `search_path = ''`, fuso UTC, tabelas referenciadas com schema explícito e SQL estático, sem SQL dinâmico montado com entradas externas.

| Função | EXECUTE concedido a | Restrições |
|---|---|---|
| `account_access()` | `authenticated` | Usa `auth.uid()`, e-mail confirmado, produto exato, pagamento aprovado e prazo válido. Não recebe ID/e-mail de outra usuária como argumento. |
| `save_workspace(integer,jsonb)` | `authenticated` | Determina o proprietário pela sessão; exige acesso anual; valida documento e revisão; trava por usuária para evitar sobrescrita concorrente. |
| `apply_payment_event(...)` | `service_role` | Produto exato e entradas limitadas; replay idêntico é idempotente; replay alterado é recusado; estados de estorno são terminais para a mesma compra. |

O `EXECUTE` é revogado explicitamente de PUBLIC e dos papéis de API antes de conceder apenas os acessos necessários. `service_role` não ganha acesso às funções de usuária; ele continua sendo uma credencial administrativa e nunca deve aparecer no navegador. Usuárias não podem escrever diretamente em pagamentos, eventos, configuração nem workspaces.

Essas funções são criadas pelo administrador que executa a migração. Não as transfira para um papel controlado por usuárias nem crie versões com permissões mais amplas. O serviço Supabase precisa continuar validando os JWTs das chamadas de usuárias.

## RLS, fotos e limites do bloqueio

- Todas as tabelas da migração têm RLS. Só o workspace de `auth.uid()` é legível, com acesso anual ativo.
- Fotos ficam no bucket privado `dream-images`. O caminho inicia pelo UUID da usuária; leitura e inserção também exigem acesso ativo.
- Políticas RESTRICTIVE mantêm essas proteções mesmo se uma política permissiva genérica já existir em `storage.objects`. Políticas sobre outros buckets continuam funcionando conforme suas próprias regras.
- Clientes não podem sobrescrever nem apagar objetos do bucket. Limpeza e exclusão de conta exigem rotina administrativa que confira referências antes de remover fotos.
- Bucket preexistente público ou incompatível faz a migração falhar e reverter a transação, em vez de manter um bucket público ou alterar configurações existentes silenciosamente.
- Senhas pertencem ao Supabase Auth. O aplicativo não armazena senhas nas tabelas de workspace/pagamentos.
- O frontend guarda sessão e cache por conta no navegador. Isso não é criptografia contra alguém com acesso físico ao aparelho, extensões maliciosas ou comprometimento do navegador. Saída/troca de conta e importação do legado foram testadas; o legado não é importado automaticamente.
- Reembolso/expiração bloqueiam novas leituras/gravações no banco e Storage. O app verifica periodicamente a situação. Isso não apaga backups, capturas ou cópias já baixadas; código de frontend estático não é DRM.

## Autenticação do webhook da Cakto — pendência obrigatória

A função usa `verify_jwt = false`, pois a Cakto não tem JWT de usuária Supabase. Isso NÃO dispensa autenticação: o handler exige configuração completa, segredo de pelo menos 32 caracteres e `CAKTO_AUTH_MODE=shared-secret`.

O adaptador suporta um valor secreto em **um único cabeçalho OU um campo do JSON**, conforme o protocolo que for confirmado. Compara hashes SHA-256 sem retornar antecipadamente no primeiro byte diferente. Não usa uma chave recebida no payload para autenticar a própria requisição: compara o valor fornecido com um segredo esperado, guardado somente no servidor.

O formato oficial e o mecanismo de autenticação da Cakto para este produto **ainda não foram confirmados com evento real**. O mapeamento de exemplo é sintético. Se a Cakto usar HMAC/assinatura do corpo, este adaptador NÃO implementa esse protocolo e deve permanecer desativado até receber a verificação correta. Não configure `shared-secret` apenas para contornar esse ponto.

Também são obrigatórios:

- `CAKTO_PRODUCT_IDS=69f774eb-5832-4dc6-9133-91f4455a8a5b`;
- `CAKTO_EVENT_MAPPING` com caminhos reais dos identificadores, e-mail, data do pagamento e evento;
- arrays explícitos e sem nomes repetidos para aprovação, reembolso e chargeback. Strings soltas e grupos ambíguos são recusados;
- segredo do webhook e chave service-role somente nos segredos da função do Supabase.

Configuração ausente, modo não implementado, mapeamento inválido ou URL de backend inesperada mantêm a função em 503, sem conceder acesso. Segredo incorreto retorna 401. Corpo não JSON ou maior que 128 KB é recusado. Falha/timeout do banco retorna 503 para permitir reenvio, com processamento idempotente. Nenhum payload com dados de cliente ou credencial é escrito em logs pelo handler.

Mesmo depois de autenticar, produto inesperado/evento não mapeado não concede acesso. O banco repete a restrição do produto, pois a validação no handler não deve ser a única defesa.

## Pagamentos, reembolsos e prazo anual

- Aprovação concede até a data original do pagamento + 1 ano de calendário, calculado em UTC. Não usa o horário em que o webhook chegou.
- Acesso requer e-mail confirmado correspondente à compra. Data futura não libera antes do pagamento; datas infinitas são recusadas.
- O primeiro pagamento de cada pedido fixa as datas. Reenvio não renova nem estende o período.
- Reembolso bloqueia a mesma compra. Chargeback é terminal e não é rebaixado por eventos atrasados. Reembolso recebido antes da aprovação cria registro terminal, impedindo que uma aprovação posterior reative a compra.
- Uma nova compra válida, com outro identificador de transação, pode liberar novo período. Estornar uma compra não invalida outra compra legítima e ainda vigente do mesmo e-mail.
- Expiração é verificada em cada acesso ao banco/Storage, sem depender de tarefa agendada. O app também revalida a sessão periodicamente.
- Cancelar uma renovação futura não é o mesmo que reembolsar o período pago: não mapeie cancelamento genérico para estorno.
- É preciso confirmar que os identificadores enviados pela Cakto distinguem cada pagamento/renovação. Esta versão não soma antecipadamente períodos de compras feitas antes do vencimento.

## Testes da revisão

`tests/accounts-sql.mjs` executa a migração completa em PostgreSQL/PGlite, com schemas representativos de Auth/Storage. Cobre produto incorreto, configuração ausente, permissões efetivas/SECURITY DEFINER/search_path/UTC, usuárias pagantes distintas, anônimos, eventos repetidos e alterados, validade/estorno, datas inválidas e políticas de Storage conflitantes. Não substitui teste no Supabase real.

`tests/payment.test.mjs` cobre autenticação, limite do corpo, mapeamentos explícitos, eventos sem colisão na chave, recusa de configurações não implementadas e falhas do backend. Nenhum desses testes declara validado o protocolo real da Cakto.

Antes de produção, confira no Supabase real as políticas, a entrega de e-mails, duas contas pagantes isoladas, uma compra de teste com o produto correto e seu reembolso/chargeback usando eventos autenticados reais. Não publique nem ative a integração antes de concluir essa etapa e obter autorização.

## Complemento: várias compras no mesmo e-mail

A versão final de `account_access()` identifica as compras elegíveis separadamente em `valid_purchases`. Só contribuem para o acesso e para `expires_at` as compras do produto fixado, da conta autenticada com e-mail confirmado, aprovadas, com datas finitas, já iniciadas e ainda dentro do prazo. A validade efetiva é o menor valor entre a expiração registrada e um ano de calendário desde o pagamento, em UTC. Uma expiração alterada indevidamente para vários anos não amplia o limite anual.

A política de negócio aplicada é por compra: estornar a compra B não invalida uma compra A legítima e ainda vigente. Se todas estiverem estornadas, em chargeback, expiradas ou inelegíveis, a conta fica sem acesso e a expiração retornada é NULL. O SQL não soma períodos entre compras nem usa o prazo de uma compra revogada para justificar outra. Uma nova compra genuína pode restaurar acesso. Bloquear globalmente o e-mail por qualquer chargeback seria uma política diferente, não implementada silenciosamente.

Foram adicionados e aprovados testes com duas compras no mesmo e-mail, estorno parcial, chargeback da compra restante, todas revogadas, aprovação atrasada, compra expirada junto de compras revogadas, expiração artificialmente longa, reenvio sem extensão de prazo, estorno antes da aprovação, nova compra válida, RLS dos dados/fotos após a última revogação e cálculo em ano bissexto.

Compatibilidade: usa SQL/PostgreSQL e schemas padrão do Supabase (`auth.users`, `auth.uid()`, `storage.buckets`, `storage.objects`), sem extensão adicional. A migração completa foi executada em PostgreSQL/PGlite com esses schemas representados; ainda não foi aplicada ao projeto Supabase real. É um script de primeira instalação, não um patch para tabelas já criadas. Execute integralmente uma vez.
