"""Reference-driven identity and real freeform editing; isolated browser storage."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse,unquote
import json,re
ROOT=Path(__file__).resolve().parents[1]
BASE='https://production.test/habitkit-app/'
MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block',has_touch=True,timezone_id='America/Araguaina')
    def serve(route):
        path=unquote(urlparse(route.request.url).path)
        assert path.startswith('/habitkit-app/')
        file=(ROOT/'dist'/(path.removeprefix('/habitkit-app/') or 'index.html')).resolve()
        assert file.is_relative_to(ROOT/'dist') and file.is_file()
        route.fulfill(status=200,content_type=MIME.get(file.suffix,'application/octet-stream'),body=file.read_bytes())
    context.route('**/*',serve)
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def action(name):return page.get_by_role('button',name=name,exact=True)
    def field(name):return page.locator(f'#alter-ego-root [name="{name}"]')
    def snapshot():
        return page.evaluate('''async()=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('habitkit-identity',1);r.onsuccess=()=>ok(r.result);r.onerror=no});return await new Promise((ok,no)=>{const r=db.transaction('workspace').objectStore('workspace').get('current');r.onsuccess=()=>ok(r.result);r.onerror=no})}''')
    page.goto(BASE)
    action('Criar meu primeiro hábito').click();page.locator('#habit-form [name=name]').fill('Leitura diária');action('Criar hábito').click()
    expect(page.locator('.habit-card')).to_have_count(1)
    assert page.locator('.tabbar button').all_text_contents()==['Hábitos','Estatísticas','Vision Board','Ajustes']
    action('Vision Board').click()
    expect(page.locator('.ir-reference-mural')).to_be_visible()
    assert page.locator('#ir-identity-form,.ir-profile,.ir-name,.ir-link-picker').count()==0
    expect(page.locator('.ir-reference-mural')).to_be_visible()
    expect(page.locator('.ir-video-hero h1')).to_have_text('Vision Board')
    assert page.locator('.tabbar').is_hidden()
    assert page.locator('.ir-categories button').all_text_contents()[:5]==['Tudo','Visão','Looks','Maquiagem','Acessórios']
    action('Novo recorte').click();action('Escolher uma imagem').click()
    page.locator('#ir-cut-file').set_input_files(ROOT/'public/logo.png')
    field('content').fill('Minha referência do vídeo');action('✓ Colar no moodboard').click()
    page.get_by_role('button',name='Abrir pasta Aparência',exact=True).click()
    expect(page.locator('.ir-mural-card')).to_have_count(1)
    action('Adicionar ao moodboard').click();action('Texto').click()
    field('content').fill('Eu sou mágica.');field('detail').fill('A vida que ela está construindo.')
    action('✓ Colar no moodboard').click()
    expect(page.locator('.ir-mural-card')).to_have_count(2)
    assert page.locator('.ir-mural-grid').evaluate("el=>getComputedStyle(el).columnCount")=='2'
    assert page.locator('.ir-mural-sticky').evaluate("el=>getComputedStyle(el).position")=='sticky'
    page.screenshot(path='/tmp/moodboard-recording-layout.png',full_page=True)
    with page.expect_download() as d:action('Exportar mural').click()
    file='/tmp/moodboard-recording-export.png';d.value.save_as(file)
    assert Path(file).read_bytes().startswith(b'\x89PNG')
    # Long press opens real deletion, while a tap edits the reference card.
    card=page.locator('[data-ego=feed-cut]').first
    card.evaluate("el=>el.scrollIntoView({block:'center'})")
    box=card.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down()
    expect(page.get_by_role('heading',name='Remover recorte?',exact=True)).to_be_visible()
    page.mouse.up();action('Confirmar').click()
    expect(page.locator('.ir-mural-card')).to_have_count(1)
    page.locator('[data-ego=feed-cut]').click();action('Remover recorte').click();action('Confirmar').click()
    expect(page.locator('.ir-mural-card')).to_have_count(0)
    action('Editar composição').click()
    expect(page.locator('.ae-canvas')).to_be_visible()
    page.locator('.ir-board .ir-categories [data-category=all]').click()
    # No old dashboard, wizard, letters or parallel goal/habit creation.
    assert page.locator('.ae-sections,.ae-progress,.ae-letter,.ae-cut-masonry').count()==0
    action('Novo recorte').click();action('Texto',).click()
    expect(page.get_by_role('heading',name='Novo recorte')).to_be_visible()
    field('content').fill('Eu não corro atrás, eu escolho.');field('detail').fill('Confiança em cada escolha.')
    page.locator('.ir-destinations [data-category="Personalidade e mentalidade"]').click()
    expect(field('content')).to_have_value('Eu não corro atrás, eu escolho.')
    page.screenshot(path='/tmp/new-cut-text-reference.png',full_page=True)
    action('✓ Colar no moodboard').click()
    expect(page.locator('.ae-element')).to_have_count(1)
    # Mouse and real touch move the element on the actual canvas.
    node=page.locator('.ae-element').first;node.evaluate("el=>el.scrollIntoView({block:'center'})");box=node.bounding_box()
    x=box['x']+box['width']/2;y=box['y']+box['height']/2
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+25,y+25,steps=5);page.mouse.up()
    expect(page.locator('.ir-selection')).to_be_visible()
    left=page.locator('.ae-element').get_attribute('style')
    node=page.locator('.ae-element');node.evaluate("el=>el.scrollIntoView({block:'center'})");box=node.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
    touch=context.new_cdp_session(page)
    touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
    touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+18,'y':y+12,'id':1}]})
    touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    expect(page.locator('.ae-element')).not_to_have_attribute('style',left)
    handle=page.locator('.ae-resize');handle.evaluate("el=>el.scrollIntoView({block:'center'})");box=handle.bounding_box()
    old_width=snapshot()['boards'][0]['elements'][0]['w']
    page.mouse.move(box['x']+16,box['y']+16);page.mouse.down();page.mouse.move(box['x']+40,box['y']+35,steps=5);page.mouse.up()
    action('Tamanho e estilo').click()
    assert float(field('w').input_value())>old_width
    field('fontSize').fill('42');field('font').select_option('system-ui,sans-serif');field('color').fill('#c72d67');field('rotation').fill('8')
    action('Aplicar estilo').click()
    expect(page.locator('.ae-element')).to_have_attribute('style',re.compile('rotate\\(8deg\\)'))
    action('Novo recorte').click()
    action('Escolher uma imagem').click();page.locator('#ir-cut-file').set_input_files(ROOT/'public/logo.png')
    expect(page.locator('.ir-photo-pick img')).to_be_visible()
    field('content').fill('Minha referência');field('detail').fill('Uma imagem para minha nova fase.')
    page.screenshot(path='/tmp/new-cut-image-reference.png',full_page=True)
    action('✓ Colar no moodboard').click()
    expect(page.locator('.ae-element')).to_have_count(2)
    action('Recortar').click()
    field('ratio').select_option('1');field('cropX').fill('70');field('cropY').fill('30');field('zoom').fill('2')
    action('Aplicar recorte').click()
    expect(page.locator('.ae-element.selected img')).to_have_attribute('style',re.compile('scale\\(2\\)'))
    stored=snapshot()['boards'][0]['elements'][1]
    assert stored['crop']=={'x':70,'y':30,'zoom':2} and stored['w']==stored['h']
    original_src=stored['src']
    assert original_src.startswith('data:image/png;base64,')
    action('Girar 15°').click();action('À frente').click();action('Atrás').click()
    action('Editar').last.click();field('content').fill('Minha referência editada');action('✓ Salvar recorte').click()
    expect(page.locator('.ae-element.selected img')).to_have_attribute('alt','Minha referência editada')
    action('Recortar').click();action('Mostrar imagem inteira').click()
    expect(page.locator('.ae-element.selected img')).to_have_attribute('style',re.compile('object-fit:contain'))
    assert snapshot()['boards'][0]['elements'][1]['src']==original_src
    page.locator('.ir-categories [data-category="Personalidade e mentalidade"]').click()
    expect(page.locator('.ae-element')).to_have_count(1)
    page.locator('.ir-categories [data-category="all"]').click()
    expect(page.locator('.ae-element')).to_have_count(2)
    action('+ Categoria').click();field('name').fill('Minha inspiração');action('Adicionar categoria').click()
    expect(page.locator('.ir-categories [data-category="Minha inspiração"]')).to_be_visible()
    action('Alterar fundo').click();field('background').fill('#eee8df');action('Salvar fundo').click()
    expect(page.locator('.ae-canvas')).to_have_attribute('style','background:#eee8df')
    action('Tela cheia').click();expect(page.locator('.ir-board-full')).to_be_visible();action('Sair da tela cheia').click()
    action('Visualizar painel').click();assert page.locator('.ae-resize').count()==0;action('Editar painel').click()
    with page.expect_download() as d:action('Exportar composição').click()
    png='/tmp/identity-rebuilt-export.png';d.value.save_as(png);assert Path(png).read_bytes().startswith(b'\x89PNG')
    action('Voltar ao mural').first.click()
    action('Opções do painel').click();action('Renomear painel').click()
    field('title').fill('Meus sonhos');action('Salvar painel').click()
    expect(page.locator('.ir-video-hero h1')).to_have_text('Meus sonhos')
    action('Voltar aos hábitos').click();page.reload()
    assert page.locator('.identity-home').count()==0
    action('Vision Board').click()
    page.locator('[data-ego=folder-open]').click()
    expect(page.locator('.ir-mural-card')).to_have_count(1)
    page.locator('.ir-reference-mural nav [data-category="Personalidade e mentalidade"]').click()
    expect(page.locator('.ir-mural-card')).to_have_count(1)
    expect(page.locator('.ir-video-hero h1')).to_have_text('Meus sonhos')
    assert page.locator('#ir-identity-form,.ir-profile,.ir-name,.ir-link-picker').count()==0
    with page.expect_download() as d:action('Exportar backup').click()
    backup='/tmp/identity-rebuilt-backup.json';d.value.save_as(backup)
    bundle=json.loads(Path(backup).read_text());assert len(bundle['boards'][0]['elements'])==2
    assert bundle['boards'][0]['elements'][1]['src']==original_src
    action('Opções do painel').click();action('Duplicar painel').click()
    expect(page.locator('#ae-board-select option')).to_have_count(2)
    action('Editar composição').click()
    page.locator('.ir-board .ir-categories [data-category=all]').click()
    page.locator('.ae-element').last.click();action('Remover').click();action('Confirmar').click()
    expect(page.locator('.ae-element')).to_have_count(1)
    # Restore does not erase existing habits; legacy workspace fields also survive.
    bundle['letter']={'content':'Carta legada preservada.','reviewDate':'2027-01-01','updatedAt':''}
    bundle['goals']=[{'id':'goal-existing','name':'Meta existente','description':'Uma meta anterior.','category':'Pessoal','trait':'Confiante','due':'2027-01-01','progress':25,'habitIds':[]}]
    bundle['identity']['name']='Identidade antiga preservada'
    page.locator('#ae-import-file').set_input_files({'name':'legacy-workspace.json','mimeType':'application/json','buffer':json.dumps(bundle).encode()})
    action('Confirmar').click();page.locator('[data-ego=folder-open]').click();expect(page.locator('.ir-mural-card')).to_have_count(1)
    assert snapshot()['letter']['content']=='Carta legada preservada.'
    assert snapshot()['identity']['name']=='Identidade antiga preservada'
    expect(page.locator('.ir-video-hero h1')).to_have_text('Meus sonhos')
    assert page.locator('#ir-identity-form,.ir-profile,.ir-name,.ir-link-picker').count()==0
    for width in [320,390,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
    action('Voltar aos hábitos').click();expect(page.locator('.habit-card')).to_have_count(1)
    action('Ajustes').click()
    with page.expect_download() as d:page.get_by_role('button',name='Exportar backup',exact=False).click()
    full='/tmp/identity-rebuilt-full-backup.json';d.value.save_as(full);saved=json.loads(Path(full).read_text())
    assert saved['alterEgo']['identity']['name']=='Identidade antiga preservada' and len(saved['habits'])==1
    assert len(saved['alterEgo']['goals'])==1 and saved['alterEgo']['letter']['content']=='Carta legada preservada.'
    assert not errors,errors
    print(json.dumps({'alter_ego_rebuild':'passed','checks':['direct Vision Board tab','no identity profile or setup gate','recording polaroid hero and two-column mural','horizontal recording categories','fixed add action','long-press removal','mural image export','reference cut sheets','real freeform canvas','mouse and touch movement','resize and rotate','text styling','reversible image crop','layer order','categories','background','fullscreen','PNG export','reopen without losing images','edit and delete','existing habits unchanged','legacy data preservation','complete backup','responsive widths'],'browser_errors':errors}))
    browser.close()
