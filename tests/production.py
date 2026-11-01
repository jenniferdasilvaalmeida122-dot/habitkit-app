"""Exercise built assets under the GitHub Pages path without opening localhost.
Uses an intercepted HTTPS test origin; this does not claim a live deployment.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
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
    assert page.locator('.complete-button.completed').count()==1
    page.reload()
    assert page.locator('.complete-button.completed').count()==1
    for width in [390,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button',name='Ajustes',exact=True).click()
    assert page.locator('.settings-profile .brand-logo').evaluate('(img) => img.complete && img.naturalWidth === 1254')
    assert not errors,errors
    for asset in ['index.html','src/app.js','src/model.js','src/style.css','public/logo.png']:
        assert asset in requests, f'Not exercised: {asset}'
    manifest=json.loads((ROOT/'manifest.webmanifest').read_text())
    assert manifest['start_url']=='./' and manifest['scope']=='./'
    assert (ROOT / manifest['icons'][0]['src']).is_file()
    print(json.dumps({'production_build':'passed','base_path':'/habitkit-app/','checks':['built assets','create habit','completion','persistence','mobile and desktop','manifest paths'],'browser_errors':errors}))
    browser.close()
