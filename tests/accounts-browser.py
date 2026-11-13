"""Account UI using an explicit fake Auth/Storage server, never live credentials."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse, unquote
import json, time
ROOT=Path(__file__).resolve().parents[1]/'dist'
BASE='https://production.test/habitkit-app/'
API='https://test-project.supabase.co'
MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
ids={'a':'11111111-1111-4111-8111-111111111111','b':'22222222-2222-4222-8222-222222222222','c':'33333333-3333-4333-8333-333333333333'}
cloud={};images={};image_uploads=[];active={'a':True,'b':True,'c':False};enabled=False;force_conflict=False
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    errors=[]
    def serve(route):
        global force_conflict
        req=route.request;u=urlparse(req.url)
        def reply(value,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(value))
        if req.url.startswith(API):
            path=u.path;data=json.loads(req.post_data or '{}') if 'json' in req.headers.get('content-type','') else {}
            token=req.headers.get('authorization','').removeprefix('Bearer access-');who=token if token in ids else None
            def user(k):return {'id':ids[k],'email':f'{k}@example.test','email_confirmed_at':'2026-01-01T00:00:00Z'}
            if path=='/auth/v1/token':
                who=data.get('email','').split('@')[0] if 'grant_type=password' in u.query else data.get('refresh_token','').removeprefix('refresh-')
                if who not in ids or data.get('password','password-test')!='password-test':return reply({'error':'invalid'},400)
                return reply({'access_token':f'access-{who}','refresh_token':f'refresh-{who}','expires_at':int(time.time())+3600,'user':user(who)})
            if path=='/auth/v1/recover':return reply({})
            if path=='/auth/v1/signup':return reply({'id':ids['a']})
            if not who:return reply({'error':'unauthorized'},401)
            if path=='/auth/v1/user':return reply(user(who))
            if path=='/auth/v1/logout':return route.fulfill(status=204)
            if path=='/rest/v1/rpc/account_access':return reply({'active':active[who],'expires_at':'2027-11-12T00:00:00Z'})
            if not active[who]:return reply({'message':'access revoked'},403)
            if path=='/rest/v1/workspaces':return reply([cloud[who]] if who in cloud else [])
            if path=='/rest/v1/rpc/save_workspace':
                revision=cloud.get(who,{}).get('revision',0)
                if force_conflict or data['expected_revision']!=revision:
                    force_conflict=False;return reply({'message':'workspace_conflict','code':'40001'},409)
                cloud[who]={'revision':revision+1,'payload':data['document']};return reply(revision+1)
            if path.startswith('/storage/v1/object/'):
                name=path.split('/dream-images/',1)[-1]
                assert name.startswith(ids[who]+'/'),'cross-account image access'
                if req.method=='POST':
                    image_uploads.append(name)
                    if name in images:return reply({'error':'Duplicate'},400)
                    images[name]=(req.post_data_buffer,req.headers['content-type']);return reply({'Key':name})
                assert name in images;body,mime=images[name];return route.fulfill(status=200,content_type=mime,body=body)
            raise AssertionError(path)
        assert u.netloc=='production.test',req.url
        relative=unquote(u.path).removeprefix('/habitkit-app/') or 'index.html'
        file=(ROOT/relative).resolve();assert file.is_relative_to(ROOT) and file.is_file(),relative
        if relative=='src/account-config.js':
            return route.fulfill(content_type='text/javascript',body='export default '+json.dumps({'enabled':enabled,'supabaseUrl':API,'publishableKey':'sb_publishable_test_only'})+';')
        route.fulfill(content_type=MIME.get(file.suffix,'application/octet-stream'),body=file.read_bytes())
    ctx.route('**/*',serve)
    page=ctx.new_page();page.clock.install();page.on('pageerror',lambda e:errors.append(str(e)))
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def login(who):
        page.locator('[name=email]').fill(f'{who}@example.test');page.locator('[name=password]').fill('password-test');button('Entrar').click()
    def create_habit(name):
        button('Criar meu primeiro hábito' if page.locator('.habit-card').count()==0 else 'Adicionar hábito').click()
        page.locator('#habit-form [name=name]').fill(name);button('Criar hábito').click()
    page.goto(BASE);create_habit('Meu legado')
    legacy=page.evaluate('localStorage.habitkit')
    enabled=True;page.reload()
    expect(page.get_by_role('heading',name='Entrar no HabitKit')).to_be_visible()
    button('Esqueci a senha').click();page.locator('[name=email]').fill('a@example.test');button('Enviar instruções').click()
    expect(page.locator('[role=status]').first).to_contain_text('Se o e-mail estiver cadastrado')
    button('Já tenho conta').click();login('a')
    expect(page.get_by_role('heading',name='Trazer meus dados deste aparelho?')).to_be_visible()
    button('Importar meus dados').click()
    expect(page.locator('.habit-card')).to_have_count(1)
    create_habit('Conta A')
    expect(page.locator('#account-sync')).to_have_text('Salvo na sua conta',timeout=15000)
    assert len(cloud['a']['payload']['habits']['habits'])==2
    button('Vision Board').click();button('Novo recorte').click();button('Escolher uma imagem').click()
    page.locator('#ir-cut-file').set_input_files(ROOT/'public/logo.png')
    page.locator('.ir-photo-pick img').wait_for();page.locator('[name=content]').fill('Sonho privado A');button('✓ Colar no moodboard').click()
    expect(page.locator('#account-sync')).to_have_text('Salvo na sua conta',timeout=15000)
    assert len(images)==1
    assert cloud['a']['payload']['vision']['boards'][0]['elements'][0]['src'].startswith('hk-storage://'+ids['a'])
    page.reload()
    expect(page.locator('.habit-card')).to_have_count(2)
    button('Vision Board').click();button('Abrir pasta Aparência').click()
    expect(page.get_by_role('button',name='Abrir sonho: Sonho privado A',exact=True)).to_be_visible()
    assert page.evaluate('localStorage.habitkit')==legacy
    assert len(image_uploads)==1, image_uploads
    button('Sair').click();expect(page.get_by_role('heading',name='Entrar no HabitKit')).to_be_visible()
    login('b');button('Começar uma conta vazia').click()
    expect(button('Criar meu primeiro hábito')).to_be_visible()
    create_habit('Conta B');expect(page.locator('#account-sync')).to_have_text('Salvo na sua conta',timeout=15000)
    assert len(cloud['a']['payload']['habits']['habits'])==2
    assert cloud['b']['payload']['habits']['habits'][0]['name']=='Conta B'
    force_conflict=True;create_habit('Conflito local')
    expect(page.get_by_role('heading',name='Há alterações em outro aparelho')).to_be_visible(timeout=15000)
    assert len(cloud['b']['payload']['habits']['habits'])==1
    with page.expect_download() as download:button('Exportar minhas alterações').click()
    target='/tmp/habitkit-account-conflict.json';download.value.save_as(target)
    assert len(json.loads(Path(target).read_text())['habits'])==2
    button('Carregar versão da conta').click();expect(page.locator('.habit-card')).to_have_count(1)
    button('Sair').click();expect(page.get_by_role('heading',name='Entrar no HabitKit')).to_be_visible()
    login('c');expect(page.get_by_role('heading',name='Acesso anual não ativo')).to_be_visible()
    assert page.locator('.habit-card').count()==0 and 'c' not in cloud
    assert page.evaluate('localStorage.habitkit')==legacy
    button('Sair da conta').click();expect(page.get_by_role('heading',name='Entrar no HabitKit')).to_be_visible()
    login('a');expect(page.locator('.habit-card')).to_have_count(2)
    active['a']=False;page.clock.fast_forward(61000)
    expect(page.get_by_role('heading',name='Acesso anual não ativo')).to_be_visible()
    assert len(cloud['a']['payload']['habits']['habits'])==2
    assert not errors,errors
    print('PASS mocked accounts: password login/recovery UI, explicit legacy import, cloud photos, reload, user isolation, conflicts with export, unpaid gate, legacy preserved')
    browser.close()
