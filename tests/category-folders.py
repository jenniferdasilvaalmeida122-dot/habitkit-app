"""Favorite dreams, details and persistence. Run npm run build first."""
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
    page.get_by_role('button',name='Vision Board',exact=True).click()
    def add_image(category, title):
        page.get_by_role('button',name='Novo recorte',exact=True).click()
        page.get_by_role('button',name='Escolher uma imagem',exact=True).click()
        page.locator('#ir-cut-file').set_input_files(ROOT.parent / 'public/logo.png')
        page.locator('.ir-photo-pick img').wait_for()
        page.locator('[name=content]').fill(title)
        page.locator('.ir-destinations').get_by_role('button',name=category,exact=True).click()
        page.get_by_role('button',name='✓ Colar no moodboard',exact=True).click()
        expect(page.locator('#ae-dialog')).not_to_be_visible()
    for n in range(4): add_image('Visão',f'Imagem {n}')
    expect(page.locator('.ir-category-folder')).to_have_count(1)
    expect(page.locator('.ir-folder-preview img')).to_have_count(3)
    expect(page.locator('.ir-category-folder small')).to_have_text('4 imagens')
    add_image('Looks','Meu look')
    expect(page.locator('.ir-category-folder')).to_have_count(2)
    page.get_by_role('button',name='Novo recorte',exact=True).click()
    page.get_by_role('button',name='Texto',exact=True).click()
    page.locator('[name=content]').fill('Um hábito por dia')
    page.locator('.ir-destinations').get_by_role('button',name='Hábitos',exact=True).click()
    page.get_by_role('button',name='✓ Colar no moodboard',exact=True).click()
    expect(page.locator('.ir-category-folder')).to_have_count(2)
    assert page.get_by_role('button',name='Abrir pasta Hábitos',exact=True).count()==0
    for width in [320,390,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/habitkit-category-folders.png',full_page=True)
    page.get_by_role('button',name='Abrir pasta Visão',exact=True).click()
    expect(page.locator('.ir-mural-card')).to_have_count(4)
    page.locator('.ir-reference-mural nav').get_by_role('button',name='Tudo',exact=True).click()
    page.get_by_role('button',name='Abrir pasta Looks',exact=True).click()
    page.get_by_role('button',name='Abrir sonho: Meu look',exact=True).click()
    page.get_by_role('button',name='Excluir sonho',exact=True).click()
    page.get_by_role('button',name='Confirmar',exact=True).click()
    expect(page.locator('.ir-mural-card')).to_have_count(0)
    page.locator('.ir-reference-mural nav').get_by_role('button',name='Tudo',exact=True).click()
    expect(page.locator('.ir-category-folder')).to_have_count(1)
    page.reload()
    page.get_by_role('button',name='Vision Board',exact=True).click()
    expect(page.locator('.ir-category-folder')).to_have_count(1)
    page.locator('.ir-reference-mural nav').get_by_role('button',name='Hábitos',exact=True).click()
    expect(page.locator('.ir-mural-card')).to_have_count(1)
    assert not errors,errors
    print('PASS: category folders, three-photo preview, counts, text-only exclusion, navigation, deletion, persistence and responsive widths')
    browser.close()
