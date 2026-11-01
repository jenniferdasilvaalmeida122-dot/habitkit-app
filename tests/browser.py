"""Functional browser checks. Start npm run dev first. Requires Python Playwright + Chromium."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json

def action(page, name):
    return page.get_by_role('button', name=name, exact=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, timezone_id='America/Araguaina')
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5173')
    page.screenshot(path='/tmp/habitkit-empty.png', full_page=True)
    action(page,'Criar meu primeiro hábito').click()
    page.locator('input[name=name]').fill('Meditar')
    page.locator('button[type=submit]').click()
    page.wait_for_selector('.habit-card')
    page.locator('.complete-button').click()
    assert page.locator('.complete-button.completed').count()==1
    page.reload()
    assert page.locator('.complete-button.completed').count()==1
    page.locator('.complete-button').click()
    assert page.locator('.complete-button.completed').count()==0
    page.locator('.complete-button').click()
    page.locator('.habit-title').click()
    assert page.locator('.metric').first.inner_text().startswith('1')
    action(page,'Anotar hoje').click()
    page.locator('textarea').fill('Um começo tranquilo.')
    action(page,'Salvar registro').click()
    assert page.locator('.note-row').count()==1
    action(page,'Mês anterior').click()
    previous_date=page.locator('.calendar-days button:not([disabled])').last
    retro_date=previous_date.get_attribute('data-date')
    previous_date.click()
    page.locator('input[name=completed]').check()
    page.locator('textarea').fill('Registro retroativo.')
    action(page,'Salvar registro').click()
    assert page.locator('.note-row').count()==2
    assert page.evaluate('JSON.parse(localStorage.habitkit).habits[0].startDate')==retro_date
    action(page,'Editar').click()
    page.locator('input[name=name]').fill('Meditar com calma')
    page.locator('input[name=color][value="#6664ee"]').check()
    action(page,'Salvar alterações').click()
    assert page.locator('.detail-page').get_attribute('style')=='--habit:#6664ee'
    action(page,'Hábitos').first.click()
    action(page,'Adicionar hábito').click()
    page.locator('input[name=name]').fill('Beber água')
    page.locator('select[name=type]').select_option('count')
    page.locator('input[name=goal]').fill('8')
    page.locator('input[name=unit]').fill('copos')
    page.locator('input[name=icon][value=drop]').check()
    action(page,'Criar hábito').click()
    page.locator('.complete-button').nth(1).click()
    page.locator('input[name=value]').fill('3')
    action(page,'Salvar registro').click()
    assert page.locator('.complete-button.completed').count()==1
    page.locator('.complete-button').nth(1).click()
    page.locator('input[name=value]').fill('8')
    action(page,'Salvar registro').click()
    assert page.locator('.complete-button.completed').count()==2
    page.screenshot(path='/tmp/habitkit-home.png',full_page=True)
    action(page,'Opções de visualização').click()
    for view in ['Compact','Split','Classic']:
        action(page,view).click()
        assert page.locator('.habit-card').count()==2
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    action(page,'Reorganizar hábitos').click()
    page.locator('[data-action=move][data-dir="1"]').first.click()
    assert page.locator('.habit-title strong').first.inner_text()=='Beber água'
    action(page,'Concluir organização').click()
    action(page,'Opções de visualização').click()
    action(page,'Adicionar hábito').click()
    page.locator('input[name=name]').fill('Caminhar')
    page.locator('select[name=type]').select_option('measure')
    page.locator('input[name=goal]').fill('2.5')
    page.locator('input[name=unit]').fill('km')
    page.locator('select[name=frequency]').select_option('custom')
    for checkbox in page.locator('input[name=days]').all():
        checkbox.uncheck()
    page.locator('input[name=days][value="1"]').check()
    page.locator('input[name=negative]').check()
    action(page,'Criar hábito').click()
    page.locator('.complete-button').last.click()
    page.locator('input[name=value]').fill('2.5')
    action(page,'Salvar registro').click()
    assert page.locator('.complete-button.completed').count()==3
    action(page,'Estatísticas').click()
    assert page.locator('.metric').first.inner_text().startswith('3') # retro + two scheduled today
    action(page,'Mês').click()
    assert page.locator('.bar-column').count()==30
    page.screenshot(path='/tmp/habitkit-stats.png',full_page=True)
    action(page,'Ajustes').click()
    page.locator('#theme').select_option('dark')
    assert page.locator('html').get_attribute('data-theme')=='dark'
    page.screenshot(path='/tmp/habitkit-dark.png',full_page=True)
    page.get_by_role('button',name='Categorias').click()
    page.locator('input[name=category]').fill('Bem-estar')
    action(page,'Adicionar').click()
    assert page.locator('.category-list').get_by_text('Bem-estar',exact=True).count()==1
    action(page,'Fechar').click()
    with page.expect_download() as d:
        page.get_by_role('button',name='Exportar backup').click()
    backup_path='/tmp/habitkit-test-backup.json'
    d.value.save_as(backup_path)
    backup=json.loads(Path(backup_path).read_text())
    assert len(backup['habits'])==3
    # Invalid backup must not replace data.
    page.locator('#backup-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"version":1,"habits":[{}],"categories":[]}'})
    page.wait_for_timeout(100)
    assert page.evaluate('JSON.parse(localStorage.habitkit).habits.length')==3
    action(page,'Hábitos').click()
    page.locator('.habit-title').first.click()
    action(page,'Arquivar').click()
    assert page.locator('.habit-card').count()==2
    action(page,'Ajustes').click()
    page.get_by_role('button',name='Hábitos arquivados').click()
    action(page,'Restaurar').click()
    action(page,'Hábitos').click()
    assert page.locator('.habit-card').count()==3
    page.locator('.habit-title').last.click()
    action(page,'Editar').click()
    action(page,'Excluir hábito').click()
    action(page,'Excluir hábito').click()
    assert page.locator('.habit-card').count()==2
    action(page,'Ajustes').click()
    page.locator('#backup-file').set_input_files(backup_path)
    action(page,'Restaurar dados').click()
    assert page.evaluate('JSON.parse(localStorage.habitkit).habits.length')==3
    action(page,'Hábitos').click()
    page.reload()
    assert page.locator('.habit-card').count()==3
    assert page.locator('html').get_attribute('data-theme')=='dark'
    for width in [320,390,768,1440]:
        page.set_viewport_size({'width':width,'height':900})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'overflow at {width}'
        page.screenshot(path=f'/tmp/habitkit-{width}.png',full_page=True)
    # Service worker must actually serve the app offline.
    page.evaluate('navigator.serviceWorker.ready')
    page.reload()
    page.wait_for_selector('.habit-card')
    context.set_offline(True)
    page.reload()
    page.wait_for_selector('.habit-card')
    assert page.locator('.habit-card').count()==3
    context.set_offline(False)
    # Corrupt local data must remain intact until an explicit restore.
    page.evaluate('localStorage.setItem("habitkit","broken-json")')
    page.reload()
    assert page.locator('.warning').count()==1
    assert page.evaluate('localStorage.habitkit')=='broken-json'
    action(page,'Ajustes').click()
    page.locator('#backup-file').set_input_files(backup_path)
    action(page,'Restaurar dados').click()
    assert page.evaluate('JSON.parse(localStorage.habitkit).habits.length')==3
    print(json.dumps({'passed':'creation, boolean toggle, counting, measurements, schedule, negative habit, notes, retroactive dates, color edit, views, reorder, stats, theme, categories, backup export/restore, invalid backup rejection, archive/restore, delete, reload, responsive widths, offline, corrupt storage recovery','console_errors':errors},ensure_ascii=False))
    assert not errors
    browser.close()
