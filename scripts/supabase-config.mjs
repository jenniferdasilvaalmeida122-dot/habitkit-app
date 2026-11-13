// Only browser-safe Supabase settings are accepted. Never read a service-role key.
export function publicSupabaseConfig(env = process.env) {
  const rawUrl = env.HABITKIT_SUPABASE_URL?.trim() || '';
  const key = env.HABITKIT_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  if (!rawUrl && !key) return {enabled:false,supabaseUrl:'',publishableKey:''};
  if (!rawUrl || !key) throw Error('Configure as duas variáveis públicas do Supabase juntas.');
  let url;
  try { url=new URL(rawUrl); } catch { throw Error('URL pública do Supabase inválida.'); }
  if (url.protocol!=='https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || url.pathname!=='/' || url.search || url.hash)
    throw Error('Use a URL HTTPS raiz do projeto Supabase.');
  if (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key)) throw Error('Use somente a chave sb_publishable_; nunca secret ou service_role.');
  return {enabled:true,supabaseUrl:url.origin,publishableKey:key};
}
