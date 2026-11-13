// Legacy synthetic-schema adapter; not the deployed entrypoint.
// index.ts uses webhook.mjs and the mandatory api-client.mjs verifier.
import {normalizePayment,sameSecret,suppliedSecret,validateMapping} from './normalize.mjs';
export function createPaymentHandler(env,send=fetch){
  return async request=>{
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    const secret=env('CAKTO_WEBHOOK_SECRET'),rawMapping=env('CAKTO_EVENT_MAPPING'),products=env('CAKTO_PRODUCT_IDS');
    const base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
    if(!secret||secret.length<32||!rawMapping||!products||!base||!key||env('CAKTO_AUTH_MODE')!=='shared-secret')return new Response('Integration not configured',{status:503});
    let mapping;
    try{
      mapping=validateMapping(JSON.parse(rawMapping));
      const url=new URL(base);
      if(url.protocol!=='https:'||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base))throw Error('Invalid backend URL');
    }catch{return new Response('Integration not configured',{status:503})}
    try{
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response('JSON required',{status:415});
      const reader=request.body?.getReader();if(!reader)return new Response('Missing payload',{status:400});
      const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128*1024){await reader.cancel();return new Response('Payload too large',{status:413})}chunks.push(value)}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
      const payload=JSON.parse(new TextDecoder().decode(bytes));
      if(!await sameSecret(suppliedSecret(request,payload,mapping),secret))return new Response('Unauthorized',{status:401});
      const event=normalizePayment(payload,mapping,products.split(',').map(v=>v.trim()));
      if(!event)return new Response('Ignored',{status:200});
      let result;try{result=await send(`${base}/rest/v1/rpc/apply_payment_event`,{
        method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(15000)
      });}catch{return new Response('Payment could not be applied',{status:503})}
      if(!result.ok)return new Response('Payment could not be applied',{status:503});
      return new Response('OK',{status:200});
    }catch{return new Response('Invalid event or configuration',{status:400})}
  };
}
