// Confirmed by the owner from Cakto's official documentation:
// POST /public_api/token/: form-urlencoded client_id + client_secret.
// GET /public_api/orders/{id}/: Authorization: Bearer <token>.
// Only status `paid` is confirmed as settled. The complete order response and
// proof of production/non-test/merchant scope are NOT yet confirmed.
// Do not infer order fields from the webhook's differently shaped JSON.
export const reviewedCaktoContract = Object.freeze({
  tokenUrl:'https://api.cakto.com.br/public_api/token/',
  orderUrlTemplate:'https://api.cakto.com.br/public_api/orders/{id}/',
  clientAuth:'body',
  // No undocumented grant_type parameter is added to Cakto's request.
  normalizeOrder(_providerJson,_requestedId){
    const error=new Error('cakto_order_fields_unconfirmed');
    error.code='cakto_order_fields_unconfirmed';
    throw error;
  },
});
