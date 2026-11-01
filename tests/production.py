"""Exercise built assets under the GitHub Pages path without opening localhost.
Uses an intercepted HTTPS test origin; this does not claim a live deployment.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from urllib.parse import urlparse, unquote
import json

ROOT = Path(__file__).resolve().parents[1] / 'dist'
BASE = 'https://production.test/habitkit-app/'
MIME = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml','.png':'image/png', '.webmanifest':'application/manifest+json'}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block',timezone_id='America/Sao_Paulo')
    errors=[]
    requests=[]
    def serve(route):
        path=unquote(urlparse(route.request.url).path)
        assert path.startswith('/habitkit-app/'), f'Asset outside project path: {path}'
        relative=path.removeprefix('/habitkit-app/') or 'index.html'
        file=(ROOT / relative).resolve()
        assert file.is_relative_to(ROOT) and file.is_file(), f'Missing built asset: {relative}'
        requests.append(relative)
        route.fulfill(status=200,content_type=MIME.get(file.suffix,'application/octet-stream'),body=file.read_bytes())
    context.route('**/*',serve)
    page=context.new_page()
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.locator('.desktop-brand .brand-logo').wait_for(state='visible')
    assert page.locator('.desktop-brand .brand-logo').evaluate('(img) => img.complete && img.naturalWidth === 1254'), 'Original logo failed to load'
    page.screenshot(path='/tmp/habitkit-logo-mobile.png',full_page=True)
    page.get_by_role('button',name='Criar meu primeiro hábito',exact=True).click()
    page.locator('input[name=name]').fill('Produção verificada')
    page.get_by_role('button',name='Criar hábito',exact=True).click()
    page.locator('.complete-button').click()
    expect(page.locator('.complete-button.completed')).to_have_count(1)
    page.reload()
    expect(page.locator('.complete-button.completed')).to_have_count(1)
    # Verify the reference layouts with real interactions and isolated test data.
    page.get_by_role('button',name='Adicionar hábito',exact=True).click()
    page.locator('input[name=name]').fill('Beber água')
    page.locator('select[name=type]').select_option('count')
    page.locator('input[name=goal]').fill('8')
    page.locator('input[name=unit]').fill('copos')
    page.locator('input[name=color][value="#20a4df"]').check()
    page.get_by_role('button',name='Criar hábito',exact=True).click()
    page.get_by_role('button',name='Últimos 5 dias',exact=True).click()
    expect(page.locator('.recent-row')).to_have_count(2)
    expect(page.locator('.recent-day')).to_have_count(10)
    page.locator('.recent-row').last.locator('.recent-day').last.click()
    page.locator('input[name=value]').fill('4')
    page.get_by_role('button',name='Salvar registro',exact=True).click()
    assert page.locator('.recent-row').last.locator('.recent-day').last.inner_text()=='4'
    page.screenshot(path='/tmp/habitkit-five-days.png',full_page=True)
    page.get_by_role('button',name='Calendário mensal',exact=True).click()
    expect(page.locator('.mini-month')).to_have_count(2)
    page.locator('.mini-month').last.locator('.month-cell.today').click()
    page.locator('input[name=value]').fill('8')
    page.get_by_role('button',name='Salvar registro',exact=True).click()
    expect(page.locator('.mini-month .month-cell.today.filled')).to_have_count(2)
    page.get_by_role('button',name='Calendário mensal: mês anterior',exact=True).click()
    page.get_by_role('button',name='Calendário mensal: próximo mês',exact=True).click()
    assert page.get_by_role('button',name='Calendário mensal: próximo mês',exact=True).is_disabled()
    page.screenshot(path='/tmp/habitkit-month-cards.png',full_page=True)
    page.get_by_role('button',name='Cartões',exact=True).click()
    expect(page.locator('.heatmap')).to_have_count(2)
    page.get_by_role('button',name='Opções de visualização',exact=True).click()
    page.get_by_role('button',name='Reorganizar hábitos',exact=True).click()
    page.get_by_role('button',name='Mover Produção verificada para baixo',exact=True).click()
    assert page.locator('.habit-title strong').first.inner_text()=='Beber água'
    page.get_by_role('button',name='Concluir organização',exact=True).click()
    page.get_by_role('button',name='Opções de visualização',exact=True).click()
    page.reload()
    assert page.locator('.habit-title strong').first.inner_text()=='Beber água'
    page.screenshot(path='/tmp/habitkit-colored-cards.png',full_page=True)
    for layout in ['Últimos 5 dias','Calendário mensal','Cartões']:
        page.get_by_role('button',name=layout,exact=True).click()
        for width in [320,390,430,1440]:
            page.set_viewport_size({'width':width,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (layout,width)
    page.get_by_role('button',name='Ajustes',exact=True).click()
    page.locator('#theme').select_option('dark')
    page.get_by_role('button',name='Hábitos',exact=True).click()
    assert page.locator('html').get_attribute('data-theme')=='dark'
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/habitkit-colored-dark.png',full_page=True)
    # The internal page stays minimal while retaining notes, stats and controls.
    page.locator('.habit-title').first.click()
    assert page.locator('.detail-identity h1').inner_text()=='Beber água'
    expect(page.locator('.tabbar')).to_have_count(0)
    assert not page.locator('.habit-statistics').evaluate('(el) => el.open')
    page.get_by_role('button',name='Anotar hoje',exact=True).click()
    page.locator('textarea[name=note]').fill('Anotação na tela simplificada.')
    page.get_by_role('button',name='Salvar registro',exact=True).click()
    expect(page.locator('.detail-notes .note-row')).to_have_count(1)
    page.get_by_role('button',name='Mês anterior',exact=True).click()
    page.get_by_role('button',name='Hoje',exact=True).click()
    expect(page.locator('.calendar-days .is-today')).to_have_count(1)
    page.locator('.habit-statistics summary').click()
    expect(page.locator('.metric')).to_have_count(4)
    page.locator('.habit-statistics summary').click()
    page.get_by_role('button',name='Editar',exact=True).click()
    page.locator('input[name=description]').fill('Cuidar da hidratação.')
    page.get_by_role('button',name='Salvar alterações',exact=True).click()
    page.wait_for_function("document.querySelector('.detail-identity p')?.textContent === 'Cuidar da hidratação.'")
    page.get_by_role('button',name='Opções do hábito',exact=True).click()
    assert page.get_by_role('button',name='Compartilhar progresso',exact=True).is_visible()
    page.get_by_role('button',name='Fechar',exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/habitkit-minimal-detail-dark.png',full_page=True)
    page.get_by_role('button',name='Voltar aos hábitos',exact=True).click()
    for width in [390,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button',name='Ajustes',exact=True).click()
    assert page.locator('.settings-profile .brand-logo').evaluate('(img) => img.complete && img.naturalWidth === 1254')
    assert not errors,errors
    for asset in ['index.html','src/app.js','src/model.js','src/alter-ego.js','src/style.css','public/logo.png']:
        assert asset in requests, f'Not exercised: {asset}'
    manifest=json.loads((ROOT/'manifest.webmanifest').read_text())
    assert manifest['start_url']=='./' and manifest['scope']=='./'
    assert (ROOT / manifest['icons'][0]['src']).is_file()
    print(json.dumps({'production_build':'passed','base_path':'/habitkit-app/','checks':['built assets','create habit','completion','persistence','mobile and desktop','manifest paths','five-day table','monthly cards','partial progress','historical editing','month navigation','reorder persistence','dark theme','minimal habit details','notes and description','secondary statistics and actions'],'browser_errors':errors}))
    browser.close()
