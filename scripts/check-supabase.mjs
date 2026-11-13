import { pathToFileURL } from 'node:url';
import { publicSupabaseConfig } from './supabase-config.mjs';
export async function checkSupabase(env=process.env, send=fetch) {
  const config=publicSupabaseConfig(env);
  if(!config.enabled)return {enabled:false};
  let response;
  try { response=await send(`${config.supabaseUrl}/auth/v1/settings`, {headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(15000)}); }
  catch { throw Error('Não foi possível consultar o Supabase. Confira o projeto e a conexão.'); }
  if(!response.ok)throw Error('O Supabase recusou a configuração pública. Confira a URL e a chave do mesmo projeto.');
  let settings;try{settings=await response.json()}catch{throw Error('Resposta inesperada do Supabase.');}
  if(settings.external?.email!==true)throw Error('Habilite e-mail/senha no Supabase Authentication.');
  if(settings.disable_signup===true)throw Error('Habilite a criação de contas por e-mail no Supabase.');
  if(settings.mailer_autoconfirm!==false)throw Error('Habilite a confirmação de e-mail no Supabase antes de ativar o acesso.');
  return {enabled:true,emailPassword:true,emailConfirmation:true};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try { const result=await checkSupabase();console.log(result.enabled?'Supabase Auth respondeu: e-mail/senha e confirmação habilitados. Banco, RLS e pagamentos ainda exigem testes de integração.':'Contas não configuradas: modo local preservado.'); }
  catch(error){console.error(error.message);process.exitCode=1;}
}
