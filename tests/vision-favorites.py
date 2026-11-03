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
    for n in range(5):
        page.get_by_role('button',name='Novo recorte',exact=True).click()
        page.get_by_role('button',name='Escolher uma imagem',exact=True).click()
        page.locator('#ir-cut-file').set_input_files(ROOT.parent / 'public/logo.png')
        page.locator('.ir-photo-pick img').wait_for(); page.locator('[name=content]').fill(f'Sonho {n}')
        if n==0:
            page.locator('.ir-upload-crop summary').click()
            page.locator('[name=uploadRatio]').select_option('0.8')
            page.locator('[name=uploadX]').fill('70')
            page.locator('[name=uploadZoom]').fill('1.5')
        page.get_by_role('button',name='✓ Colar no moodboard',exact=True).click()
        if n==0: page.get_by_role('button',name='Abrir pasta Aparência',exact=True).click()
        expect(page.locator('.ir-mural-card')).to_have_count(n+1)
        page.get_by_role('button',name=f'Favoritar: Sonho {n}',exact=True).click()
        if n<4: expect(page.get_by_role('button',name=f'Desfavoritar: Sonho {n}',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.locator('.ir-favorite[aria-pressed=true]')).to_have_count(4)
    expect(page.locator('.ir-mural-image').first).to_have_attribute('style','aspect-ratio:310/387.5')
    page.locator('[data-ego=feed-cut]').first.click()
    expect(page.get_by_role('heading',name='Detalhes do Sonho')).to_be_visible()
    page.locator('[name=detail]').fill('Meu motivo pessoal')
    page.get_by_label('Que hábitos me aproximam disso?',exact=True).fill('Ler diariamente')
    page.get_by_label('Qual pequena atitude posso começar hoje?',exact=True).fill('Ler uma página hoje')
    page.get_by_text('Em construção',exact=True).click()
    page.get_by_role('button',name='✓ Salvar',exact=True).click()
    expect(page.locator('.ir-dream-badge').first).to_have_text('Em construção')
    page.reload()
    page.get_by_role('button',name='Vision Board',exact=True).click()
    page.get_by_role('button',name='Abrir pasta Aparência',exact=True).click()
    expect(page.locator('.ir-favorite[aria-pressed=true]')).to_have_count(4)
    page.locator('[data-ego=feed-cut]').first.click()
    expect(page.locator('[name=detail]')).to_have_value('Meu motivo pessoal')
    expect(page.locator('[name=dreamHabits]')).to_have_value('Ler diariamente')
    expect(page.locator('[name=firstStep]')).to_have_value('Ler uma página hoje')
    expect(page.locator('.ir-dream-details .ir-dream-photo')).to_be_visible()
    assert page.locator('.ir-dream-details .ir-cut-types,.ir-dream-details .ir-destinations,.ir-dream-details .ir-upload-crop').count()==0
    assert 'scale(1.5)' in page.locator('.ir-dream-photo img').get_attribute('style')
    expect(page.locator('[name=dreamStatus]:checked')).to_have_value('Em construção')
    page.get_by_role('button',name='Voltar ao mural',exact=True).click()
    page.get_by_role('button',name='Voltar aos hábitos',exact=True).click()
    expect(page.locator('.ir-home-dreams img')).to_have_count(4)
    assert page.locator('main').last.evaluate('(el) => el.firstElementChild.classList.contains("ir-home-dreams")')
    assert not errors, errors
    print('PASS: favorite limit, details, status, persistence, homepage favorites')
    browser.close()
