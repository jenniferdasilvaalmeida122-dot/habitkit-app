# HabitKit

Aplicativo web de acompanhamento de hábitos, em português, inspirado na linguagem visual do HabitKit para iOS. Implementação independente, sem afiliação ao produto original.

## Desenvolvimento

Requer Node.js 20 ou superior. Não usa dependências externas nem exige banco de dados, credenciais ou instalação de pacotes.

```sh
npm run dev
```

O servidor usa a porta 5173, configurável pela variável `PORT`.

```sh
npm test          # regras de negócio e validação de backups
npm run build     # artefatos estáticos em dist/
node server.mjs --dist  # servir o build
```

O build pode ser hospedado em qualquer servidor estático com HTTPS. Nenhum segredo deve ser colocado no frontend. Na implantação, sirva `sw.js` sem cache prolongado.

## Recursos

- Hábitos de sim/não, contagem e medida, metas, unidades, cores, ícones e emoji.
- Frequência diária ou por dias da semana, categorias e hábitos negativos (concluir indica um dia em que conseguiu evitar o comportamento).
- Três visualizações: Classic com histórico anual e degradê na cor do hábito; Compact com tabela editável dos últimos cinco dias; Split com cartões de calendário mensal e navegação entre meses. Reorganização com controles para cima e para baixo, inclusive na tabela.
- Histórico de aproximadamente um ano, semanas nas colunas e sete dias nas linhas. Dias futuros não são editáveis.
- Calendário mensal, edição retroativa de valores e notas, sequências, taxas, totais e evolução semanal/mensal.
- Edição, exclusão confirmada, arquivamento e restauração de hábitos.
- Temas claro, escuro e automático; preferências persistentes.
- Backup JSON com validação antes da substituição e confirmação explícita; download dos dados originais se o armazenamento estiver corrompido.
- Compartilhamento nativo de texto quando suportado e exportação de resumo como alternativa.
- PWA instalável, funcionamento offline após a primeira visita online e lembretes enquanto o app está aberto e ativo.

A paleta oferece cores vivas. Dias vazios recebem um tom suave da cor do hábito, registros parciais usam intensidade intermediária e metas concluídas recebem a cor plena. As cores já escolhidas nos hábitos existentes são preservadas e continuam editáveis.

Os exemplos da tela vazia são sugestões: criam apenas o hábito escolhido, sem fabricar histórico. Não há dados de demonstração inseridos automaticamente.

## Dados e estatísticas

Tudo fica em `localStorage` no dispositivo. Não há conta, telemetria, backend ou sincronização. Faça backups antes de limpar o navegador ou mudar de dispositivo. Em falhas de armazenamento, o app informa que a alteração não pôde ser salva. Dados ilegíveis são preservados e a edição fica bloqueada até restaurar um backup válido.

As estatísticas consideram os dias programados desde o início do acompanhamento; registrar uma data anterior amplia esse início. Dias não programados não quebram sequências. Uma meta ainda não atingida hoje não quebra a sequência antes do fim do dia. Alterar meta ou frequência recalcula o histórico segundo as regras atuais. Arquivados não entram nas estatísticas gerais, mas preservam seus próprios registros.

## Limitações da plataforma

- Notificações exigem permissão do usuário e suporte do navegador. Sem suporte ou permissão, lembretes aparecem dentro do app.
- Lembretes funcionam com o app aberto e ativo; não há garantia de execução em segundo plano. Notificações agendadas com o app fechado exigem push com backend ou aplicativo nativo.
- No iPhone, a instalação deve ser feita pelo Safari em Compartilhar → Adicionar à Tela de Início. Notificações web dependem também da versão do iOS e da instalação.
- Widgets nativos iOS não são disponibilizados por este aplicativo web. A PWA oferece acesso pela tela inicial.
- Acesso a service worker, instalação e compartilhamento dependem de HTTPS (ou localhost em desenvolvimento).

## Validação visual

A referência da App Store foi solicitada, mas o proxy do ambiente bloqueou `apps.apple.com` com HTTP 403. A interface foi implementada a partir do briefing; fidelidade exata às capturas oficiais ainda precisa ser comparada após a liberação da rede. Os domínios Apple necessários foram salvos no rascunho de configuração.

Testes de navegador adicionais usam Python com Playwright e Chromium. No ambiente preparado:

```sh
python3 tests/browser.py
```

Esses testes usam um perfil temporário e dados próprios, sem alterar dados de usuários. Capturas de validação ficam em `/tmp`.

## Publicação na internet — GitHub Pages

O repositório inclui `.github/workflows/deploy.yml`. Cada push na branch `main` executa os testes, gera `dist/` e publica o artefato pelo GitHub Actions. Os caminhos do HTML, manifesto e service worker funcionam no subdiretório `/habitkit-app/`.

Ativação inicial pelo proprietário do repositório:

1. Abra **Settings → Pages** em `https://github.com/jenniferdasilvaalmeida122-dot/habitkit-app/settings/pages`.
2. Em **Build and deployment → Source**, selecione **GitHub Actions**.
3. Em **Actions → Publicar HabitKit no GitHub Pages**, execute **Run workflow** na branch `main` (ou reexecute um workflow que falhou antes da ativação).
4. Aguarde os jobs `build` e `deploy` ficarem verdes. O link confirmado de publicação aparece no ambiente `github-pages` e em Settings → Pages.

Endereço esperado após a publicação bem-sucedida:
`https://jenniferdasilvaalmeida122-dot.github.io/habitkit-app/`

Esse endereço não deve ser considerado ativo antes de o deploy concluir. Se o repositório for privado, a disponibilidade do Pages depende do plano GitHub; não altere sua visibilidade sem decidir se deseja tornar todo o código público. Se Actions estiver desativado, habilite-o em Settings → Actions → General. Políticas da conta podem exigir aprovação do ambiente `github-pages`.

Não é necessário cadastrar tokens ou segredos para esse workflow: ele usa o `GITHUB_TOKEN` temporário fornecido pelo próprio GitHub com permissões de Pages e identidade OIDC. Mac e celular usam o mesmo endereço HTTPS, mas os históricos continuam separados em cada navegador; use backup/restauração para transferir dados.

Validação do build para hospedagem em subdiretório, sem abrir servidor local:

```sh
npm run build
python3 tests/production.py
```

O teste intercepta as requisições em uma origem HTTPS de teste e serve os arquivos de `dist`; verifica recursos, criação, conclusão, persistência e responsividade. Não representa um teste do site público e não valida o service worker em produção.

### Diagnóstico de falhas no GitHub Pages

O workflow verifica a configuração com `actions/configure-pages@v5`, valida os arquivos obrigatórios em `dist/`, envia esse diretório com `actions/upload-pages-artifact@v3` sob o nome explícito `github-pages` e usa o mesmo `artifact_name` em `actions/deploy-pages@v4`. O job de publicação recebe `contents: read`, `pages: write` e `id-token: write`; o build recebe apenas leitura do código e da configuração do Pages.

Um HTTP 404 ao criar o deployment não prova que `dist/` está incorreto: também pode ocorrer quando o site Pages não foi ativado ou a origem de publicação não está configurada corretamente. Verifique **Settings → Pages → Build and deployment → Source → GitHub Actions**. A ação `configure-pages` verifica o site; ela não cria nem ativa automaticamente o Pages com o token padrão deste workflow. Caso o GitHub não ofereça Pages para o repositório, confira o plano e as políticas da organização. Não altere a visibilidade do código sem avaliar essa decisão.

Após a correção, execute **Actions → Publicar HabitKit no GitHub Pages → Run workflow → Branch: main → Run workflow**. Use uma execução nova: **Re-run jobs** em uma execução antiga reutiliza o commit antigo e não testa a versão corrigida. O push na `main` também dispara uma execução nova automaticamente.

Na execução nova, confira:

- **Verificar configuração do GitHub Pages** concluído.
- **Verificar arquivos de produção** listando `dist/index.html`, arquivos de `dist/src/`, manifesto, service worker e ícone.
- **Enviar artefato do site** concluído e um artefato chamado **github-pages** na página da execução.
- O job **deploy** concluído no mesmo workflow; ele depende do build dessa execução, sem caminhos locais entre jobs.

Se o artefato tiver expirado ou estiver ausente, execute novamente o workflow inteiro na `main`, não somente o deploy. Se o deploy continuar retornando 404 mesmo com esses passos, compartilhe o log completo do job e a configuração exibida em Settings → Pages, sem tokens ou outros segredos, para distinguir permissão, política do repositório e configuração do site.

A tela interna de cada hábito segue uma composição reduzida: ícone, nome e descrição opcional, histórico anual com rolagem própria, sequência/meta, calendário e notas. Estatísticas e evolução permanecem em uma seção recolhível; registro de hoje, compartilhamento e arquivamento ficam no menu de opções. O calendário oferece seleção de mês, retorno a hoje e edição dos dias. Nenhum registro ou cor existente é removido por essa mudança visual.


## My Alter Ego — antes de Ajustes

A aba **Alter Ego** fica entre Estatísticas e Ajustes. O módulo acrescenta identidade e moodboard sem trocar o sistema de hábitos existente. A Home ganha somente um resumo discreto depois que o usuário define um nome para sua identidade.

- Identidade em quatro etapas: nome, descrição, frase de identidade, características por categoria e personalizadas, valores e dez reflexões opcionais. Os rascunhos são salvos automaticamente.
- Vários moodboards com título, fundo personalizado e categorias. Imagens PNG/JPG/WebP/GIF da galeria, frases, afirmações, palavras e elementos decorativos são elementos reais do editor.
- Movimento por mouse/toque, alça de redimensionamento, campos precisos de posição/tamanho, rotação, tipografia, destaque, borda, cantos, cores, enquadramento e ordem de camadas. Setas do teclado movem o elemento selecionado; Shift reduz o passo.
- Visualização sem controles de edição, tela cheia, duplicação, exclusão confirmada, capa da identidade, exportação PNG de 1600 × 2000 e compartilhamento de imagem quando suportado (download como alternativa).
- Carta da versão futura com salvamento automático, perguntas de apoio e revisão em data livre ou em 30/60/90 dias. O aviso de revisão aparece ao abrir a seção; não agenda push com o app fechado.
- Comportamentos por característica, com vínculo aos IDs dos hábitos existentes; nenhuma segunda lista de hábitos é criada. Sugestões só criam um hábito quando o usuário abre e confirma o formulário original.
- Como o aplicativo anterior não tinha módulo de metas, o Alter Ego acrescenta metas de identidade com nome, descrição, categoria, prazo, característica, comportamento de origem e hábitos relacionados. O progresso é manual ou calculado pela taxa média dos hábitos vinculados. Excluir um comportamento não exclui hábitos ou metas.

### Persistência, backup e limites

O documento do Alter Ego e os bytes das imagens ficam em **IndexedDB**, banco `habitkit-identity`, store `workspace`. Imagens não são links temporários ou somente estado de tela. Hábitos continuam em `localStorage`. Nenhum serviço externo recebe fotos ou textos. A identidade permite até 30 painéis, 100 elementos por painel e 90 MB por workspace; uploads aceitam até 8 MB por imagem.

O backup completo em Ajustes inclui hábitos e a identidade com imagens, carta, comportamentos e metas. O módulo também tem exportação/restauração independente. Arquivos são validados antes de substituir dados e a restauração exige confirmação; backups antigos somente de hábitos preservam a identidade atual. O limite de importação é 100 MB. O exportador de imagens usa apenas arquivos locais do usuário, sem buscar referências externas.

**Não há autenticação, banco online nem sincronização entre dispositivos.** Os dados são isolados por origem e perfil do navegador, não por contas dentro do mesmo perfil. Para transferir do Mac para o celular, exporte e restaure um backup no outro dispositivo. Para sincronização automática e isolamento por conta, é necessário configurar autenticação, banco com regras de acesso e armazenamento de imagens em um serviço online; credenciais não devem ser colocadas no código público. Limpar dados do site também apaga o IndexedDB: mantenha backups externos.

Testes adicionais do módulo, sem abrir localhost:

```sh
npm test
npm run build
python3 tests/alter-ego-browser.py
python3 tests/production.py
```

O teste do Alter Ego usa um perfil isolado e cobre navegação antes de Ajustes, onboarding, valores personalizados, capa e imagens persistentes, movimento real por toque, redimensionamento, edição/camadas/categorias, PNG, tela cheia, duplicação, exclusão, carta, hábitos vinculados, metas, larguras de 320 a 1440 px e restauração de backups. Os dados de teste não são inseridos no perfil de usuários.
