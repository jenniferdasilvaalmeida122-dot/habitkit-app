import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayment, sameSecret, suppliedSecret, validateMapping } from '../supabase/functions/cakto-webhook/normalize.mjs';
const mapping={secretHeader:'x-example-secret',event:'kind',eventId:'eventId',orderId:'order.id',productId:'order.product',email:'order.email',paidAt:'order.paidAt',events:{approved:['example_paid'],refunded:['example_refunded'],chargeback:['example_chargeback']}};
const sample=()=>({kind:'example_paid',eventId:'event-1',order:{id:'order-1',product:'annual-1',email:'Buyer@Example.test',paidAt:'2026-11-12T15:00:00Z'}});
test('synthetic payment adapter normalizes the configured product and immutable purchase date',()=>{
 const event=normalizePayment(sample(),mapping,['annual-1']);assert.equal(event.buyer_email,'buyer@example.test');assert.equal(event.approved_at,'2026-11-12T15:00:00Z');assert.equal(event.event_key,'cakto:7:event-1:7:order-1:approved');
 assert.equal(normalizePayment(sample(),mapping,['other-product']),null);
 const s=sample();s.kind='not-mapped';assert.equal(normalizePayment(s,mapping,['annual-1']),null);
});
test('refunds do not require or invent a new payment date',()=>{const s=sample();s.kind='example_refunded';delete s.order.paidAt;const event=normalizePayment(s,mapping,['annual-1']);assert.equal(event.event_kind,'refunded');assert.equal(event.approved_at,null)});
test('reject malformed or ambiguous mapped payment data',()=>{
 for(const mutate of [s=>s.order.email='invalid',s=>s.order.paidAt='2026-11-12',s=>delete s.order.id,s=>s.eventId='',s=>s.order.paidAt='nonsense']){const s=sample();mutate(s);assert.throws(()=>normalizePayment(s,mapping,['annual-1']))}
 assert.throws(()=>normalizePayment(sample(),{...mapping,event:'__proto__.kind'},['annual-1']));
 assert.throws(()=>normalizePayment(sample(),{...mapping,events:{approved:['example_paid'],chargeback:['example_paid']}},['annual-1']));
});
test('webhook authentication fails closed for missing, short or incorrect secrets',async()=>{
 const secret='s'.repeat(40);assert.equal(await sameSecret(null,secret),false);assert.equal(await sameSecret('short','short'),false);assert.equal(await sameSecret('x'.repeat(40),secret),false);assert.equal(await sameSecret(secret,secret),true);
 assert.equal(suppliedSecret(new Request('https://example.test',{headers:{'x-example-secret':secret}}),{},mapping),secret);
 assert.throws(()=>suppliedSecret(new Request('https://example.test'),{},{}));
});

import { createPaymentHandler } from '../supabase/functions/cakto-webhook/handler.mjs';
test('webhook handler refuses unconfigured and unauthenticated requests before any database call',async()=>{
 const values={CAKTO_AUTH_MODE:'shared-secret',CAKTO_WEBHOOK_SECRET:'s'.repeat(40),CAKTO_EVENT_MAPPING:JSON.stringify(mapping),CAKTO_PRODUCT_IDS:'annual-1',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-test-value'};
 let calls=0;const send=async()=>{calls++;return new Response('null',{status:200})};
 const post=(payload,secret='wrong')=>new Request('https://example.test/webhook',{method:'POST',headers:{'content-type':'application/json','x-example-secret':secret},body:JSON.stringify(payload)});
 assert.equal((await createPaymentHandler(()=>undefined,send)(post(sample()))).status,503);
 const handle=createPaymentHandler(name=>values[name],send);
 assert.equal((await handle(new Request('https://example.test/webhook'))).status,405);
 assert.equal((await handle(post(sample()))).status,401);assert.equal(calls,0);
 assert.equal((await handle(post({padding:'x'.repeat(130*1024)},'s'.repeat(40)))).status,413);assert.equal(calls,0);
 assert.equal((await handle(post(sample(),'s'.repeat(40)))).status,200);assert.equal(calls,1);
 assert.equal((await handle(post({...sample(),kind:'not-a-payment'},'s'.repeat(40)))).status,200);assert.equal(calls,1);
 const broken=createPaymentHandler(name=>values[name],async()=>new Response('database failed',{status:500}));
 assert.equal((await broken(post(sample(),'s'.repeat(40)))).status,503);
});

test('webhook mappings require explicit nonoverlapping arrays; no substring status match',()=>{
 assert.throws(()=>validateMapping({...mapping,events:{...mapping.events,approved:'example_unpaid'}}));
 assert.throws(()=>validateMapping({...mapping,events:{...mapping.events,refunded:[]}}));
 assert.throws(()=>validateMapping({...mapping,secretPath:'secret'}));
 const a=sample(),b=sample();a.eventId='a:b';a.order.id='c';b.eventId='a';b.order.id='b:c';
 assert.notEqual(normalizePayment(a,mapping,['annual-1']).event_key,normalizePayment(b,mapping,['annual-1']).event_key);
});
test('unverified/unsupported authentication and invalid backend configuration remain disabled',async()=>{
 const values={CAKTO_AUTH_MODE:'shared-secret',CAKTO_WEBHOOK_SECRET:'s'.repeat(40),CAKTO_EVENT_MAPPING:JSON.stringify(mapping),CAKTO_PRODUCT_IDS:'annual-1',SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-test-value'};
 const post=()=>new Request('https://example.test/webhook',{method:'POST',headers:{'content-type':'application/json','x-example-secret':'s'.repeat(40)},body:JSON.stringify(sample())});
 for(const override of [{CAKTO_AUTH_MODE:''},{CAKTO_AUTH_MODE:'hmac-unimplemented'},{SUPABASE_URL:'https://unrelated.test'},{CAKTO_EVENT_MAPPING:'{}'},{CAKTO_WEBHOOK_SECRET:'short'}]){
  let calls=0;const handle=createPaymentHandler(name=>({...values,...override})[name],async()=>{calls++;return new Response('null')});
  assert.equal((await handle(post())).status,503);assert.equal(calls,0);
 }
 const failed=createPaymentHandler(name=>values[name],async()=>{throw Error('network failure')});
 assert.equal((await failed(post())).status,503);
});
