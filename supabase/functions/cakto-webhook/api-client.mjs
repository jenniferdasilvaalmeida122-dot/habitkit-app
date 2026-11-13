// OAuth2 client-credentials and order lookup. No dependencies or token logging.
// Only reviewed provider metadata can enable these requests.
export class CaktoApiError extends Error {
  constructor(code) { super(code); this.code=code; }
}
const fail=code=>{throw new CaktoApiError(code)};
function providerUrl(raw) {
  let url;try{url=new URL(raw)}catch{fail('cakto_api_contract_invalid')}
  if(url.protocol!=='https:'||url.hostname!=='api.cakto.com.br'||url.port||url.username||url.password||url.hash)
    fail('cakto_api_contract_invalid');
  return url;
}
function validateContract(contract){
  if(!contract)fail('cakto_api_contract_unverified');
  if(!['body','basic'].includes(contract.clientAuth)||typeof contract.normalizeOrder!=='function')fail('cakto_api_contract_invalid');
  providerUrl(contract.tokenUrl);
  if(typeof contract.orderUrlTemplate!=='string'||contract.orderUrlTemplate.split('{id}').length!==2)fail('cakto_api_contract_invalid');
  providerUrl(contract.orderUrlTemplate.replace('{id}','validation-only'));
  return contract;
}
async function json(response,limit){
  if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))fail('cakto_api_response_invalid');
  const reader=response.body?.getReader();if(!reader)fail('cakto_api_response_invalid');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('cakto_api_response_too_large')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail('cakto_api_response_invalid')}
}
function basicValue(value){return new URLSearchParams({v:value}).toString().slice(2)}
// Structure-only diagnostics for a successful authenticated order response.
// No string/number/boolean values, credentials, or raw response are returned.
function orderShape(value){
  const fields=[];
  function visit(node,path,depth){
    if(depth>4||fields.length>=60)return;
    const type=node===null?'null':Array.isArray(node)?'array':typeof node;
    fields.push({path:path||'$root',type});
    if(type==='array'){if(node.length)visit(node[0],path+'[]',depth+1);return}
    if(type==='object')for(const key of Object.keys(node).slice(0,30)){
      if(!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)||['__proto__','prototype','constructor'].includes(key))continue;
      visit(node[key],path?path+'.'+key:key,depth+1);
    }
  }
  visit(value,'',0);return fields;
}
export function createCaktoApi(env,{contract,send=fetch,now=()=>Date.now()}={}) {
  let cached=null,refreshing=null;
  async function token(){
    const c=validateContract(contract);
    if(cached&&cached.validUntil>now())return cached.value;
    if(refreshing)return refreshing;
    const id=env('CAKTO_CLIENT_ID'),secret=env('CAKTO_CLIENT_SECRET');
    if(!id||!secret)fail('cakto_oauth_credentials_missing');
    refreshing=(async()=>{
      const body=new URLSearchParams();
      if(c.grantType)body.set('grant_type',c.grantType);
      const headers={'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'};
      if(c.clientAuth==='body'){body.set('client_id',id);body.set('client_secret',secret)}
      else headers.Authorization='Basic '+btoa(basicValue(id)+':'+basicValue(secret));
      let response;try{response=await send(c.tokenUrl,{method:'POST',headers,body:body.toString(),redirect:'error',signal:AbortSignal.timeout(15000)})}catch{fail('cakto_oauth_unavailable_retry')}
      if(!response.ok)fail(response.status===401||response.status===403?'cakto_oauth_credentials_rejected':'cakto_oauth_unavailable_retry');
      const data=await json(response,65536);
      const lifetime=Number(data?.expires_in);
      if(typeof data?.access_token!=='string'||!data.access_token||data.access_token.length>16384||/[\r\n]/.test(data.access_token)||String(data.token_type).toLowerCase()!=='bearer'||!Number.isFinite(lifetime)||lifetime<=0)
        fail('cakto_oauth_response_invalid');
      cached={value:data.access_token,validUntil:now()+Math.max(0,Math.min(lifetime,86400)-Math.min(60,lifetime/2))*1000};
      return cached.value;
    })();
    try{return await refreshing}finally{refreshing=null}
  }
  async function lookup(transactionId){
    const c=validateContract(contract);
    if(typeof transactionId!=='string'||!(/^[A-Za-z0-9_-]{1,200}$/).test(transactionId))fail('cakto_transaction_id_invalid');
    const url=providerUrl(c.orderUrlTemplate.replace('{id}',encodeURIComponent(transactionId))).href;
    for(let attempt=0;attempt<2;attempt++){
      const accessToken=await token();
      let response;try{response=await send(url,{method:'GET',headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{fail('cakto_order_unavailable_retry')}
      if(response.status===401&&attempt===0){if(cached?.value===accessToken)cached=null;continue}
      if(response.status===404)fail('cakto_order_not_found');
      if(!response.ok)fail(response.status===401||response.status===403?'cakto_order_access_denied':'cakto_order_unavailable_retry');
      const providerJson=await json(response,524288);
      let normalized;
      try{normalized=await c.normalizeOrder(providerJson,transactionId)}
      catch(error){
        if(error?.code==='cakto_order_fields_unconfirmed'){
          const pending=new CaktoApiError('cakto_order_fields_unconfirmed');
          pending.publicShape=orderShape(providerJson);throw pending;
        }
        fail('cakto_order_evidence_invalid');
      }
      if(!normalized||normalized.transactionId!==transactionId||typeof normalized.productId!=='string'||typeof normalized.email!=='string'||!['paid','refunded','chargeback','pending','unknown'].includes(normalized.status))fail('cakto_order_evidence_invalid');
      // This marker is attached by the authenticated server client, not a body field.
      return {...normalized,source:'cakto_api'};
    }
    fail('cakto_order_access_denied');
  }
  return {lookup};
}
