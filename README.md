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


## Alter Ego — reconstrução conforme a referência

A aba **Alter Ego** permanece antes de **Ajustes**. A experiência anterior com etapas, páginas e indicadores foi substituída por uma entrada com foto principal, nome, descrição, características e prévia da composição. O botão Abrir Moodboard abre a apresentação da gravação: capa com título e três polaroides, categorias deslizantes, mural em duas colunas e ação de adicionar fixa embaixo. O lápis abre o editor de composição livre. Criar e editar a identidade usa um formulário direto, com foto da galeria e características personalizadas.

O formulário **Novo recorte** segue a referência: categoria, seleção Imagem/Texto, prévia da foto, legenda curta ou frase principal, detalhe opcional e ação **Colar no moodboard**. A visualização principal é o mural em duas colunas da gravação, com imagens em altura natural, legendas e cartões de frases. O editor acessível pelo lápis mantém os elementos posicionados livremente e permite sobreposição. Ambos usam os mesmos recortes; não há duplicação de dados.

Recursos do editor:

- Toque em um cartão para editar e toque longo para remover, conforme a gravação. No editor livre, movimento por mouse e toque, redimensionamento por alça e campos numéricos, rotação e ordem de camadas.
- Edição de frases e palavras, fonte, tamanho, cores, destaque, borda, cantos e fundo do painel.
- Recorte de imagens **reversível**, com proporções, posição horizontal/vertical e zoom. O arquivo original continua guardado; a composição exportada aplica o mesmo enquadramento.
- Filtros por Aparência, Corpo e saúde, Carreira e dinheiro, Estilo de vida, Casa e viagens, Personalidade e mentalidade, Relacionamentos e Espiritualidade. Categorias usadas em painéis antigos e categorias personalizadas são mantidas.
- Visualização sem controles, tela cheia, duplicação/renomeação/exclusão de painéis e exportação PNG de 1600 × 2000. Compartilhamento nativo quando suportado, ou download da composição.
- Vínculos entre características e **hábitos/metas existentes**. Não há criação de outro sistema de hábitos ou metas neste módulo.

### Dados, preservação e sincronização

A reconstrução conserva o banco IndexedDB `habitkit-identity`, store `workspace`. Recortes antigos, imagens, posições e identidades continuam legíveis. Campos legados, inclusive cartas, valores, comportamentos e metas, permanecem no documento e nos backups, embora os fluxos antigos tenham sido removidos da interface. Os hábitos em `localStorage` não são apagados ou substituídos pelo editor.

Imagens ficam em armazenamento persistente, não em URLs temporárias. As alterações aplicadas ao painel são salvas automaticamente. Os formulários de identidade/recorte são confirmados pelo botão Salvar/Colar. O backup completo de Ajustes inclui hábitos e a identidade com as imagens; também há backup independente do Alter Ego. Backups antigos apenas de hábitos preservam a identidade atual.

Limites: até 30 painéis, 100 recortes por painel, imagem de até 8 MB, documento de até 90 MB e importação de backup de até 100 MB. Formatos de imagem aceitos: PNG, JPG, WebP e GIF. O navegador precisa conseguir decodificar a imagem para importá-la.

Não há contas, servidor nem sincronização automática entre dispositivos. Os dados são separados por origem e perfil do navegador. Para transferir entre Mac e celular, exporte/restaure um backup. Sincronização automática e isolamento por conta dependem de configurar autenticação, banco online e armazenamento com regras de acesso. Limpar os dados do site também apaga o banco local; mantenha backups externos.

### Validação

```sh
npm test
npm run build
python3 tests/alter-ego-browser.py
python3 tests/production.py
```

Os testes de navegador usam perfis isolados e arquivos de `dist/` em uma origem HTTPS interceptada, sem abrir localhost. Cobrem criação/edição da identidade, foto e características, formulários de recortes, movimento real por toque, tamanho/rotação/camadas, recorte reversível, texto, categorias, PNG, persistência após recarga, exclusão, vínculos existentes, dados legados, backup e larguras de 320 a 1440 px. Não inserem dados fictícios no perfil do usuário nem comprovam o deploy público.

A exportação do mural respeita as posições, alturas e tipografia das duas colunas mostradas na tela. A exportação do editor livre preserva o posicionamento manual, rotação e camadas. As duas opções geram PNG e utilizam as imagens persistidas no dispositivo. As categorias iniciais do mural seguem a gravação; categorias anteriores e personalizadas permanecem acessíveis.
