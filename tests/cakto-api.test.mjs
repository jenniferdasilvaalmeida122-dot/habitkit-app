import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaktoApi} from '../supabase/functions/cakto-webhook/api-client.mjs';
import {createCaktoHandler} from '../supabase/functions/cakto-webhook/webhook.mjs';
import {reviewedCaktoContract} from '../supabase/functions/cakto-webhook/api-contract.mjs';
// These routes and response fields are SYNTHETIC TEST FIXTURES, not claimed Cakto endpoints.
const contract={tokenUrl:'https://api.cakto.com.br/fixture/oauth',orderUrlTemplate:'https://api.cakto.com.br/fixture/orders/{id}',clientAuth:'body',grantType:'client_credentials',normalizeOrder:(json,id)=>({...json.receipt,transactionId:json.receipt?.transactionId})};
const product='69f774eb-5832-4dc6-9133-91f4455a8a5b';
const values={CAKTO_CLIENT_ID:'dummy-id',CAKTO_CLIENT_SECRET:'dummy-secret',CAKTO_WEBHOOK_SECRET:'dummy-webhook-secret-longer-than-32-chars',CAKTO_MODE:'live',SUPABASE_URL:'https://test-project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'dummy-service-key',CAKTO_EVENT_MAP:JSON.stringify({approved:['purchase_approved'],renewed:['subscription_renewed'],refunded:['refund'],chargeback:['chargeback'],cancelled:['fixture_cancelled'],ignored:[]})};
const env=n=>values[n];
const paidAt=new Date(Date.now()-86400000).toISOString();
const receipt=id=>({transactionId:id,productId:product,email:'buyer@example.test',status:'paid',paidAt,environment:'production',isTest:false,merchantVerified:true});
const token=()=>Response.json({access_token:'dummy-bearer',token_type:'Bearer',expires_in:3600});
function request(){return new Request('https://function.example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:values.CAKTO_WEBHOOK_SECRET,event:'purchase_approved',data:[{id:'order-1',product:{id:product},customer:{email:'buyer@example.test'},status:'paid',paidAt}]})})}
test('confirmed Cakto routes send exactly the documented token fields but incomplete order evidence cannot grant access',async()=>{
 assert.equal(reviewedCaktoContract.tokenUrl,'https://api.cakto.com.br/public_api/token/');
 assert.equal(reviewedCaktoContract.orderUrlTemplate,'https://api.cakto.com.br/public_api/orders/{id}/');
 let network=0,writes=0;
 const api=createCaktoApi(env,{contract:reviewedCaktoContract,send:async(url,options)=>{
  network++;
  if(url===reviewedCaktoContract.tokenUrl){
   assert.equal(options.method,'POST');assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');
   assert.deepEqual([...new URLSearchParams(options.body).keys()].sort(),['client_id','client_secret']);return token();
  }
  assert.equal(url,'https://api.cakto.com.br/public_api/orders/order-1/');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer dummy-bearer');
  return Response.json({id:'order-1',status:'paid',customer:{email:'do-not-log@example.test'},token:'do-not-log-token',product:{id:product}});
 }});
 await assert.rejects(()=>api.lookup('order-1'),error=>{
  assert.equal(error.code,'cakto_order_fields_unconfirmed');assert.ok(error.publicShape.some(x=>x.path==='customer.email'&&x.type==='string'));
  assert.ok(!JSON.stringify(error.publicShape).includes('do-not-log@example.test'));assert.ok(!JSON.stringify(error.publicShape).includes('do-not-log-token'));return true;
 });assert.equal(network,2);
 const handler=createCaktoHandler(env,async()=>{writes++;return Response.json(null)},()=>{},api.lookup);
 assert.equal((await handler(request())).status,503);assert.equal(writes,0);
 const logs=[];const inspect=createCaktoHandler(n=>({...values,CAKTO_MODE:'inspect'})[n],async()=>{writes++;return Response.json(null)},v=>logs.push(v),api.lookup);
 assert.equal((await inspect(request())).status,200);assert.equal(writes,0);
 assert.equal(logs[0].shapes[0].api_check,'cakto_order_fields_unconfirmed');assert.ok(logs[0].shapes[0].api_shape.length>0);
 assert.ok(!JSON.stringify(logs).includes('do-not-log@example.test'));
});
test('OAuth client_credentials is cached and concurrent lookups share the token request',async()=>{
 let tokenCalls=0,gets=0;
 const api=createCaktoApi(env,{contract,send:async(url,options)=>{
  assert.equal(options.redirect,'error');assert.ok(options.signal);
  if(options.method==='POST'){tokenCalls++;const form=new URLSearchParams(options.body);assert.equal(form.get('grant_type'),'client_credentials');assert.equal(form.get('client_id'),'dummy-id');assert.equal(form.get('client_secret'),'dummy-secret');return token()}
  gets++;assert.equal(options.headers.Authorization,'Bearer dummy-bearer');return Response.json({receipt:receipt(url.split('/').at(-1))});
 }});
 const results=await Promise.all(['one','two','three'].map(id=>api.lookup(id)));assert.equal(tokenCalls,1);assert.equal(gets,3);assert.equal(results[0].source,'cakto_api');
});
test('token expiry and one unauthorized retry refresh credentials, without infinite retry',async()=>{
 let clock=0,post=0,get=0;
 const api=createCaktoApi(env,{contract,now:()=>clock,send:async(url,options)=>{
  if(options.method==='POST'){post++;return Response.json({access_token:'token-'+post,token_type:'Bearer',expires_in:120})}
  get++;if(get===1)return new Response('',{status:401});return Response.json({receipt:receipt('order-1')});
 }});
 await api.lookup('order-1');assert.equal(post,2);assert.equal(get,2);
 clock=61000;await api.lookup('order-1');assert.equal(post,3);
});
test('Basic client authentication stays on the configured provider host',async()=>{
 let called=0;
 const api=createCaktoApi(env,{contract:{...contract,clientAuth:'basic'},send:async(url,options)=>{
  called++;if(options.method==='POST'){assert.ok(options.headers.Authorization.startsWith('Basic '));assert.equal(new URLSearchParams(options.body).has('client_secret'),false);return token()}
  return Response.json({receipt:receipt('order-1')});
 }});await api.lookup('order-1');assert.equal(called,2);
 for(const bad of [{tokenUrl:'https://evil.example/token'},{orderUrlTemplate:'http://api.cakto.com.br/orders/{id}'},{orderUrlTemplate:'https://api.cakto.com.br/orders/'},{tokenUrl:'https://user:password@api.cakto.com.br/token'}])await assert.rejects(()=>createCaktoApi(env,{contract:{...contract,...bad}}).lookup('order-1'),/contract_invalid/);
 await assert.rejects(()=>api.lookup('../token'),/transaction_id_invalid/);
});
test('404, 429, bad OAuth bodies and inconsistent order IDs fail closed',async()=>{
 for(const status of [404,429,500]){
  const api=createCaktoApi(env,{contract,send:async(url,options)=>options.method==='POST'?token():new Response('private provider details',{status})});
  await assert.rejects(()=>api.lookup('order-1'),new RegExp(status===404?'order_not_found':'order_unavailable'));
 }
 const malformed=createCaktoApi(env,{contract,send:async()=>Response.json({access_token:'unexpected'})});
 await assert.rejects(()=>malformed.lookup('order-1'),/oauth_response_invalid/);
 const mismatch=createCaktoApi(env,{contract,send:async(url,options)=>options.method==='POST'?token():Response.json({receipt:receipt('another-order')})});
 await assert.rejects(()=>mismatch.lookup('order-1'),/order_evidence_invalid/);
});
test('the entry handler uses API dates/state, rejects test and pending evidence, and inspect never writes',async()=>{
 let writes=[];const save=async(url,options)=>{writes.push(JSON.parse(options.body));return Response.json(null)};
 for(const patch of [{isTest:true},{environment:'sandbox'},{merchantVerified:false},{productId:'other-product'},{status:'pending'}]){
  const api=createCaktoApi(env,{contract,send:async(url,options)=>options.method==='POST'?token():Response.json({receipt:{...receipt('order-1'),...patch}})});
  assert.equal((await createCaktoHandler(env,save,()=>{},api.lookup)(request())).status,503);assert.equal(writes.length,0);
 }
 const api=createCaktoApi(env,{contract,send:async(url,options)=>options.method==='POST'?token():Response.json({receipt:receipt('order-1')})});
 const logs=[];
 assert.equal((await createCaktoHandler(n=>({...values,CAKTO_MODE:'inspect'})[n],save,v=>logs.push(v),api.lookup)(request())).status,200);
 assert.equal(writes.length,0);assert.equal(logs[0].shapes[0].api_check,'verified_production_payment_no_grant');
 assert.ok(!JSON.stringify(logs).includes(values.CAKTO_CLIENT_SECRET));assert.ok(!JSON.stringify(logs).includes('buyer@example.test'));
 assert.equal((await createCaktoHandler(env,save,()=>{},api.lookup)(request())).status,200);assert.equal(writes.length,1);assert.equal(writes[0].approved_at,paidAt);
});
