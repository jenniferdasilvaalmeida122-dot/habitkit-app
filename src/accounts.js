import { selectAccount, habitsKey, readVision, writeVision, accountChanges } from './account-store.js';
import { packImages, unpackImages } from './cloud-data.js';
import { freshState, validateBackup } from './model.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export async function startAccounts(config) {
  const root = document.querySelector('#app');
  let base, session, revision = 0, timer, pending = Promise.resolve(), failed = false, loaded = false, stopped = false, changeNumber = 0;
  let sessionKey;const uploadedImages=new Set();
  const dirtyKey = () => `habitkit:pending:${session.user.id}`;
  const gate = (title, body) => {
    root.innerHTML = `<main class="account-gate"><img src="./public/logo.png" alt="Logo HabitKit"><h1>${title}</h1>${body}</main>`;
    document.querySelector('#account-bar')?.remove();
  };
  const message = text => { const node = root.querySelector('[role=status]'); if (node) node.textContent = text; };
  function remember(value) { session = value; if (value) localStorage.setItem(sessionKey, JSON.stringify(value)); else localStorage.removeItem(sessionKey); }
  async function request(path, { method='GET', body, binary, contentType, anonymous=false, headers={} } = {}) {
    if (!anonymous && session && session.expires_at * 1000 < Date.now() + 60000) await refresh();
    const response = await fetch(base + path, { method, cache:'no-store', headers: { apikey:config.publishableKey,
      ...(!anonymous && session ? { Authorization:`Bearer ${session.access_token}` } : {}),
      ...(body ? { 'Content-Type':'application/json' } : {}), ...(contentType ? { 'Content-Type':contentType } : {}), ...headers },
      body: binary ?? (body ? JSON.stringify(body) : undefined) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const failure = Error(response.status === 409 || error.message?.includes('workspace_conflict') ? 'Outro aparelho salvou uma versão mais recente. Exporte suas alterações antes de recarregar.' : response.status === 401 ? 'Entre novamente para continuar.' : response.status === 403 ? 'Seu acesso não está ativo. Confira o pagamento com o suporte.' : 'Não foi possível concluir. Verifique os dados e tente novamente.');
      failure.status = response.status; failure.code = error.code; throw failure;
    }
    if (binary === 'download') return response;
    if (response.status === 204) return null;
    return response.json();
  }
  async function refresh() {
    const response = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, { method:'POST', headers:{ apikey:config.publishableKey, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:session.refresh_token }) });
    if (!response.ok) throw Error('Sua sessão terminou. Entre novamente.');
    remember(await response.json());
  }
  async function upload(path, bytes, type) {
    if(uploadedImages.has(path))return;
    const response = await fetch(`${base}/storage/v1/object/dream-images/${path}`, { method:'POST', headers:{ apikey:config.publishableKey, Authorization:`Bearer ${session.access_token}`, 'Content-Type':type, 'x-upsert':'false' }, body:bytes });
    if (!response.ok) { const e = await response.json().catch(() => ({})); if (e.statusCode !== '409' && e.statusCode !== 409 && e.error !== 'Duplicate') throw Error('Não foi possível guardar uma imagem na conta.'); }
    uploadedImages.add(path);
  }
  async function download(path) {
    const response = await fetch(`${base}/storage/v1/object/authenticated/dream-images/${path}`, { headers:{ apikey:config.publishableKey, Authorization:`Bearer ${session.access_token}` }, cache:'no-store' });
    if (!response.ok) throw Error('Não foi possível carregar uma imagem da conta.');
    const bytes = await response.arrayBuffer(); const type = path.split('.').at(-1); const blob = new Blob([bytes],{type:`image/${type}`});
    if (blob.size > 8*1024*1024) throw Error('Imagem maior que o limite.');
    uploadedImages.add(path);
    return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
  }
  async function snapshot() {
    return { habits:validateBackup(JSON.parse(localStorage.getItem(habitsKey()) || JSON.stringify(freshState()))), vision:await readVision() };
  }
  function setStatus(text) { const e = document.querySelector('#account-sync'); if (e) e.textContent = text; }
  async function backup() {
    const local = await snapshot(); const blob = new Blob([JSON.stringify({...local.habits, alterEgo:local.vision},null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href=url; a.download='habitkit-alteracoes-locais.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function flush() {
    clearTimeout(timer);
    const n = changeNumber;
    pending = pending.catch(() => {}).then(async () => {
      setStatus('Salvando na conta…');
      const access = await request('/rest/v1/rpc/account_access', {method:'POST', body:{}});
      if (!access.active) throw Error('Seu acesso anual não está ativo.');
      const payload = await packImages(await snapshot(), session.user.id, upload);
      revision = await request('/rest/v1/rpc/save_workspace', {method:'POST', body:{expected_revision:revision, document:payload}});
      failed = false;
      if (n === changeNumber) localStorage.removeItem(dirtyKey());
      setStatus('Salvo na sua conta');
    }).catch(error => {
      failed = true; setStatus('Alterações ainda não salvas na conta');
      if (error.status === 409 || error.code === '40001' || error.message.includes('Outro aparelho')) {
        stopped=true; gate('Há alterações em outro aparelho', `<p>Preservamos suas alterações neste navegador. Exporte uma cópia antes de carregar a versão da conta.</p><button id="download-pending">Exportar minhas alterações</button><button id="load-cloud">Carregar versão da conta</button>`);
        root.querySelector('#download-pending').onclick=backup;
        root.querySelector('#load-cloud').onclick=()=>{localStorage.removeItem(dirtyKey());location.reload()};
      } else if (!stopped) setStatus(error.message);
    });
    await pending;
  }
  function authForm(mode='login') {
    const signup=mode==='signup', reset=mode==='reset';
    gate(reset?'Recuperar senha':signup?'Criar minha conta':'Entrar no HabitKit', `<p>${reset?'Enviaremos as instruções para trocar sua senha.':'Use o mesmo e-mail da sua compra anual.'}</p><form id="account-auth"><label>E-mail<input type="email" name="email" autocomplete="email" required maxlength="254"></label>${reset?'':`<label>Senha<input type="password" name="password" autocomplete="${signup?'new-password':'current-password'}" ${signup?'minlength="10"':''} required maxlength="128"></label>`}<p role="status" aria-live="polite"></p><button type="submit">${reset?'Enviar instruções':signup?'Criar conta':'Entrar'}</button></form><div class="account-links"><button id="switch-auth">${signup||reset?'Já tenho conta':'Criar conta'}</button>${reset?'':'<button id="forgot-auth">Esqueci a senha</button>'}</div>`);
    root.querySelector('#switch-auth').onclick=()=>authForm(signup||reset?'login':'signup');
    root.querySelector('#forgot-auth')?.addEventListener('click',()=>authForm('reset'));
    root.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const form=event.target, submit=form.querySelector('[type=submit]');submit.disabled=true;
      const email=form.elements.email.value.trim().toLowerCase(), password=form.elements.password?.value;
      try {
        if (reset) { await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(new URL('./',location.href).href)}`,{method:'POST',body:{email},anonymous:true});message('Se o e-mail estiver cadastrado, você receberá as instruções.'); }
        else if (signup) {
          const result=await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(new URL('./',location.href).href)}`,{method:'POST',body:{email,password},anonymous:true});
          if (result.access_token) {remember(result);await openAccount();} else message('Confira seu e-mail para confirmar a conta. Depois, entre com sua senha.');
        } else {
          const result=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},anonymous:true});remember(result);await openAccount();
        }
      } catch { message('Não foi possível entrar ou concluir o pedido. Confira os dados e tente novamente.'); }
      finally {submit.disabled=false}
    };
  }
  async function recovery() {
    gate('Crie sua nova senha','<form><label>Nova senha<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p role="status"></p><button type="submit">Salvar nova senha</button></form>');
    root.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await request('/auth/v1/user',{method:'PUT',body:{password:e.target.elements.password.value}});await openAccount()}catch{message('Não foi possível trocar a senha. Solicite um novo link.')}};
  }
  async function signout() {
    if (loaded && !stopped) { await flush(); if (failed) {setStatus('Exporte suas alterações antes de sair.');return;} }
    await request('/auth/v1/logout',{method:'POST'}).catch(()=>{});
    stopped=true;clearTimeout(timer);remember(null); location.reload();
  }
  async function accessGate() {
    gate('Acesso anual não ativo','<p>Seu pagamento ainda não foi confirmado, foi encerrado ou o período anual terminou. Não apague seus dados: confira o e-mail da compra com o suporte.</p><button id="retry-access">Verificar novamente</button><button id="exit-account">Sair da conta</button><p role="status"></p>');
    root.querySelector('#retry-access').onclick=()=>openAccount().catch(()=>message('Não foi possível verificar agora.'));
    root.querySelector('#exit-account').onclick=signout;
  }
  async function importChoice() {
    const legacyHabits=localStorage.getItem('habitkit'), legacyVision=await readVision('habitkit-identity');
    if (!legacyHabits && !legacyVision?.boards?.some(b=>b.elements.length)) return null;
    return new Promise(resolve=>{
      gate('Trazer meus dados deste aparelho?', '<p>Há dados antigos sem conta neste navegador. Importe apenas se forem seus. Eles serão copiados para esta conta; os originais serão preservados.</p><button id="import-local">Importar meus dados</button><button id="start-empty">Começar uma conta vazia</button><p role="status"></p>');
      root.querySelector('#import-local').onclick=()=>{try{resolve({habits:legacyHabits?validateBackup(JSON.parse(legacyHabits)):freshState(),vision:legacyVision})}catch{message('Não foi possível importar os dados antigos. Exporte um backup no aplicativo original antes de tentar novamente.')}};
      root.querySelector('#start-empty').onclick=()=>resolve(null);
    });
  }
  async function openAccount() {
    gate('Conectando sua conta…','<p>Aguarde enquanto verificamos seu acesso e carregamos seus dados.</p>');
    const user=await request('/auth/v1/user');session.user=user;remember(session);
    if (!user.email_confirmed_at) {gate('Confirme seu e-mail','<p>Confirme o endereço pelo link enviado e entre novamente.</p><button id="exit-account">Voltar</button>');root.querySelector('button').onclick=signout;return;}
    const access=await request('/rest/v1/rpc/account_access',{method:'POST',body:{}});
    if (!access.active) return accessGate();
    selectAccount(user.id);
    const rows=await request('/rest/v1/workspaces?select=payload,revision');
    if (!Array.isArray(rows)||rows.length>1) throw Error('Resposta de dados inválida.');
    if (localStorage.getItem(dirtyKey())) {
      gate('Há alterações guardadas neste aparelho','<p>Antes de carregar a conta, exporte as alterações que ainda não foram sincronizadas.</p><button id="backup-pending">Exportar alterações</button><button id="use-cloud">Carregar versão da conta</button>');
      root.querySelector('#backup-pending').onclick=backup;
      root.querySelector('#use-cloud').onclick=()=>{localStorage.removeItem(dirtyKey());location.reload()};return;
    }
    let initial=rows[0]?await unpackImages(rows[0].payload,user.id,download):await importChoice();
    revision=rows[0]?.revision||0;
    initial||={habits:freshState(),vision:null};
    const habits=validateBackup(initial.habits);
    // Validate the entire Vision Board before replacing this account's local cache.
    const {validateAlterEgoBackup}=await import('./vision-validation.js');
    const vision=initial.vision===null?null:validateAlterEgoBackup(initial.vision);
    localStorage.setItem(habitsKey(),JSON.stringify(habits));await writeVision(vision);
    const bar=document.createElement('div');bar.id='account-bar';bar.innerHTML=`<span>${esc(user.email)}</span><small id="account-sync">Salvo na sua conta</small><button id="account-retry">Salvar agora</button><button id="account-backup">Exportar cópia</button><button id="account-exit">Sair</button>`;
    root.before(bar);bar.querySelector('#account-exit').onclick=signout;bar.querySelector('#account-retry').onclick=flush;bar.querySelector('#account-backup').onclick=backup;
    loaded=true;
    await import('./app.js');
    const changed=()=>{if(stopped)return;changeNumber++;localStorage.setItem(dirtyKey(),'1');setStatus('Salvando na conta…');clearTimeout(timer);timer=setTimeout(flush,1200)};
    accountChanges.addEventListener('change',changed);
    if (!rows[0]) changed();
    addEventListener('beforeunload',e=>{if(session?.user&&localStorage.getItem(dirtyKey())){e.preventDefault();e.returnValue=''}});
    addEventListener('storage',e=>{if(e.key===sessionKey)location.reload()});
    setInterval(async()=>{if(stopped)return;try{const access=await request('/rest/v1/rpc/account_access',{method:'POST',body:{}});if(!access.active){stopped=true;clearTimeout(timer);await accessGate()}}catch{stopped=true;clearTimeout(timer);gate('Conecte-se para continuar','<p>Não foi possível verificar seu acesso. As alterações locais foram preservadas.</p><button id="reconnect">Tentar novamente</button><button id="export-offline">Exportar cópia</button>');root.querySelector('#reconnect').onclick=()=>location.reload();root.querySelector('#export-offline').onclick=backup}},60000);
  }
  try {
    base=new URL(config.supabaseUrl).origin;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!config.publishableKey) throw Error('Configuração de contas incompleta.');
    sessionKey=`habitkit:session:${new URL(base).hostname}`;
    session=JSON.parse(localStorage.getItem(sessionKey)||'null');
    const hash=new URLSearchParams(location.hash.slice(1));
    if (hash.has('access_token')) {
      remember({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||3600)});
      history.replaceState(null,'',location.pathname+location.search);
      if (hash.get('type')==='recovery') {await request('/auth/v1/user');await recovery();return;}
    }
    if (session?.access_token && session?.refresh_token) await openAccount();else authForm();
  } catch {
    gate('Não foi possível conectar','<p>Seus dados locais foram preservados. Verifique sua conexão ou a configuração da conta.</p><button id="reload-account">Tentar novamente</button><button id="reset-session">Entrar novamente</button>');
    root.querySelector('#reload-account').onclick=()=>location.reload();root.querySelector('#reset-session').onclick=()=>{if(sessionKey)localStorage.removeItem(sessionKey);location.reload()};
  }
}
