"""Compare the unchanged local-mode UI with a build of the published HEAD.
Prepare /tmp/habitkit-baseline-check/dist from git archive HEAD before running.
"""
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect
from PIL import Image, ImageChops
import os
CURRENT=Path(__file__).resolve().parents[1]/'dist'
BASELINE=Path(os.environ.get('HABITKIT_BASELINE_DIST','/tmp/habitkit-baseline-check/dist'))
BASE='https://production.test/habitkit-app/'
MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}
assert BASELINE.is_dir(),'Prepare the published HEAD baseline first'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    def shots(root,label,width):
        ctx=browser.new_context(viewport={'width':width,'height':844},service_workers='block',color_scheme='light',timezone_id='America/Sao_Paulo')
        def serve(route):
            u=urlparse(route.request.url);assert u.netloc=='production.test'
            relative=unquote(u.path).removeprefix('/habitkit-app/') or 'index.html'
            file=(root/relative).resolve();assert file.is_relative_to(root) and file.is_file()
            route.fulfill(content_type=MIME.get(file.suffix,'application/octet-stream'),body=file.read_bytes())
        ctx.route('**/*',serve);page=ctx.new_page();page.goto(BASE)
        expect(page.get_by_role('heading',name='Meus hábitos',exact=True)).to_be_visible()
        page.add_style_tag(content='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}')
        files=[]
        for view in ['home','vision']:
            if view=='vision':
                page.get_by_role('button',name='Vision Board',exact=True).click()
                page.locator('.ir-reference-mural').wait_for()
            path=f'/tmp/habitkit-{label}-{width}-{view}.png'
            page.screenshot(path=path,full_page=True);files.append(path)
        ctx.close();return files
    for width in [320,390,1440]:
        before=shots(BASELINE,'baseline',width);after=shots(CURRENT,'prepared',width)
        for original,prepared in zip(before,after):
            a,b=Image.open(original).convert('RGB'),Image.open(prepared).convert('RGB')
            assert a.size==b.size,(original,a.size,b.size)
            difference=ImageChops.difference(a,b)
            assert difference.getbbox() is None,f'Visual change: {original} vs {prepared}'
    browser.close()
print('PASS design: home and current Vision Board pixel-identical to published HEAD at 320, 390 and 1440 px in local mode')
