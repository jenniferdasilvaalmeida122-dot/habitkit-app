// No assumed provider schema. Configure only after checking Cakto's actual
// authenticated payload in its dashboard/current official documentation.
function validPath(path) {
  return typeof path==='string' && path.length>0 && path.length<=300 && path.split('.').every(k=>/^[A-Za-z0-9_-]+$/.test(k) && !['__proto__','prototype','constructor'].includes(k));
}
function at(value,path) {
  if(!validPath(path))throw Error('Invalid event mapping');
  return path.split('.').reduce((v,k)=>v && Object.hasOwn(v,k)?v[k]:undefined,value);
}
export function validateMapping(mapping) {
  if(!mapping || typeof mapping!=='object' || Array.isArray(mapping))throw Error('Invalid event mapping');
  for(const key of ['event','eventId','orderId','productId','email','paidAt'])if(!validPath(mapping[key]))throw Error('Invalid event mapping');
  if(Boolean(mapping.secretHeader)===Boolean(mapping.secretPath))throw Error('Configure exactly one authentication source');
  if(mapping.secretHeader && !/^[A-Za-z0-9-]{1,128}$/.test(mapping.secretHeader))throw Error('Invalid authentication header');
  if(mapping.secretPath && !validPath(mapping.secretPath))throw Error('Invalid authentication path');
  const seen=new Set();
  for(const kind of ['approved','refunded','chargeback']){
    const events=mapping.events?.[kind];
    if(!Array.isArray(events)||events.length===0||events.length>30)throw Error('Payment event groups must be explicit arrays');
    for(const name of events){if(typeof name!=='string'||!name||name.length>200||seen.has(name))throw Error('Invalid or ambiguous payment event');seen.add(name)}
  }
  return mapping;
}
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
export function normalizePayment(payload, mapping, allowedProducts) {
  validateMapping(mapping);
  const name=at(payload,mapping.event), product=at(payload,mapping.productId);
  if (!allowedProducts.includes(product)) return null;
  const kinds=['approved','refunded','chargeback'].filter(kind=>mapping.events?.[kind]?.includes(name));
  if (kinds.length===0) return null;
  if (kinds.length!==1) throw Error('Ambiguous payment event');
  const kind=kinds[0], order=at(payload,mapping.orderId), event=at(payload,mapping.eventId), email=at(payload,mapping.email);
  const paid=kind==='approved'?at(payload,mapping.paidAt):null;
  if (!text(product,200)||!text(order,200)||!text(event,200)||!text(email,254)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    kind==='approved'&&(!text(paid,100)||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(paid)||!Number.isFinite(Date.parse(paid)))) throw Error('Invalid payment event');
  return {event_key:`cakto:${event.length}:${event}:${order.length}:${order}:${kind}`,purchase_id:order,product,buyer_email:email.trim().toLowerCase(),event_kind:kind,approved_at:paid};
}
export async function sameSecret(actual,expected) {
  if(typeof actual!=='string'||typeof expected!=='string'||expected.length<32)return false;
  const encoder=new TextEncoder(),a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(actual))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(expected)));
  let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
export function suppliedSecret(request,payload,mapping) {
  if(Boolean(mapping.secretHeader)===Boolean(mapping.secretPath))throw Error('Configure exactly one authentication source');
  if(mapping.secretHeader)return request.headers.get(mapping.secretHeader);
  if(mapping.secretPath)return at(payload,mapping.secretPath);
  throw Error('Webhook authentication is not configured');
}
