# Supabase — o que falta configurar manualmente

O código de integração e o workflow estão preparados no ambiente de desenvolvimento. Ainda não foram enviados ao GitHub nem publicados. As variáveis cadastradas no GitHub Actions não são automaticamente injetadas neste chat. A consulta à API do GitHub foi bloqueada; os valores reais ainda não puderam ser conferidos aqui.

## 1. Criar as tabelas e as regras de segurança

No painel do projeto **Vision Planner**, abra **SQL Editor → New query**. Copie todo o conteúdo de [`../supabase/migrations/202611120001_accounts.sql`](../supabase/migrations/202611120001_accounts.sql) e execute uma vez.

A migração usa uma transação: se falhar, as alterações daquele script são desfeitas. Não apaga tabelas ou dados existentes. Se aparecer que uma tabela/política já existe, pare e compartilhe apenas a mensagem de erro, sem senhas nem dados de clientes; não apague o que existe para tentar novamente.

Ela prepara o produto `69f774eb-5832-4dc6-9133-91f4455a8a5b`, informado pelo proprietário. Não é uma chave secreta. Criar a configuração não concede acesso sem pagamento. Use a versão atualizada do arquivo completo, de `BEGIN` a `COMMIT`.

Ela prepara:

| Item | Finalidade |
|---|---|
| `auth.users` | Já fornecida pelo Supabase; gerencia contas e senhas. Não criamos outra tabela de senhas. |
| `public.vision_planner_config` | ID fixo do produto anual; apenas administração, sem acesso direto das usuárias. |
| `public.workspaces` | Hábitos, preferências e documento do Vision Board por ID da usuária. |
| `public.purchase_access` | Situação e validade do acesso anual; somente o servidor altera. |
| `public.payment_events` | Histórico mínimo para impedir processamento repetido de pagamentos. |
| `dream-images` | Bucket privado das fotos, com pastas por ID da usuária. |

A usuária só lê seu próprio workspace e suas próprias fotos, com e-mail confirmado e acesso anual ativo. A gravação usa uma função que determina o ID pela sessão autenticada; não aceita escolher o ID de outra usuária. Regras restritivas protegem as fotos mesmo se outra função do projeto já tiver criado políticas permissivas de Storage.

Se `dream-images` já existir com configurações incompatíveis, o script para com `dream_images_bucket_configuration_mismatch`; ele não muda um bucket existente silenciosamente. Confira as configurações antes de prosseguir: privado, até 8 MB por arquivo e MIME PNG, JPEG, WebP e GIF.

## 2. Ativar e-mail e senha

Em **Authentication → Sign In / Providers → Email** (o nome do menu pode variar):

- Habilite cadastro e entrada por e-mail/senha.
- Habilite confirmação do e-mail.
- Use senha mínima de 10 caracteres.

Senhas ficam no Supabase Auth; não vão para as tabelas do aplicativo. Criar uma conta não libera uma compra: o banco exige também o pagamento ativo daquele e-mail.

## 3. Configurar os links dos e-mails

Em **Authentication → URL Configuration**:

- **Site URL:** `https://jenniferdasilvaalmeida122-dot.github.io/habitkit-app/`
- **Redirect URLs:** adicione exatamente o mesmo endereço.

Isso permite voltar ao app depois da confirmação de e-mail ou recuperação da senha. Não use curingas amplos em produção.

## 4. Configurar entrega dos e-mails

Antes de abrir para clientes, configure um remetente verificado e SMTP compatível com o Supabase. O envio padrão tem restrições e não deve ser presumido disponível para todos os e-mails de clientes. Confira os limites e os custos do provedor escolhido. O login normal usa senha; não envia código a cada acesso.

Credenciais SMTP pertencem às configurações do Supabase, nunca às variáveis públicas do GitHub nem ao código.

## 5. Conectar os pagamentos da Cakto

Ainda é necessário conferir o produto anual, o formato real e o mecanismo de autenticação dos eventos de aprovação, reembolso e chargeback. O adaptador preparado recusa uma configuração incompleta; não foi presumido um formato da Cakto como se já estivesse validado.

Configure e teste a função de webhook antes de abrir o acesso para clientes. Veja os passos e as limitações em [CONTAS-E-PAGAMENTO.md](CONTAS-E-PAGAMENTO.md). Segredos de webhook e `service_role` ficam apenas no backend do Supabase.

## 6. Testar antes da publicação autorizada

Use duas contas de teste diferentes. Confira e-mail de confirmação, recuperação de senha, salvamento, fotos, acesso após nova sessão e isolamento entre contas. Depois valide expiração, reembolso e eventos repetidos da Cakto.

Os testes locais executam SQL/RLS em PostgreSQL de teste e simulam Auth/Storage no navegador. Eles passaram, mas não substituem os testes no seu projeto real. Sem a configuração administrativa do projeto e os eventos reais da Cakto, não podemos afirmar que o serviço de produção está conectado.

Nenhum push para `main`, workflow de publicação ou alteração no site público deve ocorrer sem autorização explícita.
