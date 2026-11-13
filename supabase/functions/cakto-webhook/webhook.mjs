/* PREPARACAO V2 — NAO IMPLANTAR: adaptador da API Cakto ainda pendente.
 * Vision Planner — copia separada, nao altera a funcao instalada.
 * Sem imports/dependencias. Nao publique o frontend para instalar esta funcao.
 * Auth: campo JSON `secret`, como no exemplo fornecido da Cakto.
 * CAKTO_MODE=inspect (padrao): identifica eventos, SEM gravar acessos.
 * CAKTO_MODE=live: exige CAKTO_EVENT_MAP completo e validado com eventos reais.
 */
const PRODUCT_ID = "69f774eb-5832-4dc6-9133-91f4455a8a5b";
const MAX_BYTES = 256 * 1024;
const MAX_ITEMS = 50;
const ACTIONS = ["approved", "renewed", "refunded", "chargeback", "cancelled"];

function reply(status, code, extra = {}) {
  return new Response(JSON.stringify({ code, ...extra }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identifier(value, max = 200) {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}
function eventName(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value);
}
async function sha(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
}
async function authenticate(actual, expected) {
  if (typeof actual !== "string" || actual.length > 1024) return false;
  const a = await sha(actual), b = await sha(expected);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
function parseEventMap(raw) {
  let value;
  try { value = JSON.parse(raw || "null"); } catch { throw Error("event_map_invalid"); }
  if (!record(value)) throw Error("event_map_invalid");
  const result = new Map();
  for (const action of [...ACTIONS, "ignored"]) {
    const names = action === "ignored" ? value[action] || [] : value[action];
    if (!Array.isArray(names) || names.length > 30 ||
      (action !== "ignored" && names.length === 0)) throw Error("event_map_incomplete");
    for (const name of names) {
      if (!eventName(name) || result.has(name)) throw Error("event_map_ambiguous");
      result.set(name, action);
    }
  }
  if (result.get("purchase_approved") !== "approved") throw Error("approved_event_invalid");
  return result;
}
function paymentDate(value, now) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (year < 1970 || month < 1 || month > 12 || day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time > now + 5 * 60 * 1000) return null;
  // Preserve up to six fractional digits and the original offset for PostgreSQL.
  return value;
}
async function readPayload(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return { error: reply(415, "json_required") };
  const reader = request.body?.getReader();
  if (!reader) return { error: reply(400, "body_required") };
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BYTES) { await reader.cancel(); return { error: reply(413, "body_too_large") }; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!record(payload)) return { error: reply(400, "object_required") };
    return { payload };
  } catch { return { error: reply(400, "invalid_json") }; }
}
function rowsOf(payload) {
  const rows = Array.isArray(payload.data) ? payload.data : record(payload.data) ? [payload.data] : null;
  if (!rows || rows.length === 0 || rows.length > MAX_ITEMS || rows.some(row => !record(row)))
    throw Error("invalid_purchase_data");
  return rows;
}
async function inspect(payload, log, lookup) {
  // Never log `payload`, secret, email, name, document, card or phone.
  let rows = []; try { rows = rowsOf(payload); } catch { /* Shape only. */ }
  const target = rows.filter(row => row.product?.id === PRODUCT_ID);
  const shapes = [];
  for (const row of target) {
    let api_check='not_checked',api_shape;
    if(identifier(row.id)){
      try{
        const hint={purchase_id:row.id,buyer_email:typeof row.customer?.email==='string'?row.customer.email.trim().toLowerCase():'',event_kind:'approved'};
        await verifyCallsWithCakto([hint],lookup);api_check='verified_production_payment_no_grant';
      }catch(error){
        const safe=new Set(['cakto_order_fields_unconfirmed','cakto_api_contract_unverified','cakto_api_contract_invalid','cakto_oauth_credentials_missing','cakto_oauth_credentials_rejected','cakto_oauth_unavailable_retry','cakto_order_not_found','cakto_order_unavailable_retry','cakto_order_access_denied','production_payment_not_verified','api_payment_identity_mismatch','payment_state_unconfirmed_retry']);
        api_check=safe.has(error.code||error.message)?(error.code||error.message):'verification_inconclusive';
        if(api_check==='cakto_order_fields_unconfirmed')api_shape=error.publicShape;
      }
    }
    shapes.push({api_check,...(api_shape?{api_shape}:{}),
      transaction_tag: identifier(row.id) ? (await sha(row.id)).slice(0, 12) : null,
      has_email: typeof row.customer?.email === "string",
      paid_at_valid: Boolean(paymentDate(row.paidAt, Date.now())),
      status_is_paid: row.status === "paid",
      has_refund_date: Boolean(row.refundedAt),
      has_chargeback_date: Boolean(row.chargedbackAt),
      id_equals_subscription_id: record(row.subscription) && row.id === row.subscription.id,
    });
  }
  log({ marker: "cakto_inspect", event: payload.event, data_kind: Array.isArray(payload.data) ? "array" : typeof payload.data,
    configured_product_id: PRODUCT_ID, received_product_ids: [...new Set(rows.map(row=>row.product?.id).filter(id=>identifier(id)))], target_count: target.length, shapes });
  return reply(200, "inspection_only_no_access_changed", { event: payload.event });
}
async function normalize(rows, action, now) {
  const calls = []; let skipped = 0;
  for (const row of rows) {
    if (!identifier(row.product?.id)) throw Error("product_id_missing");
    if (row.product.id !== PRODUCT_ID) { skipped++; continue; }
    if (action === "cancelled") { skipped++; continue; }
    if (!identifier(row.id)) throw Error("transaction_id_missing");
    // Use each transaction's id, NEVER subscription.id, refId or parent_order.
    if (record(row.subscription) && row.id === row.subscription.id)
      throw Error("subscription_id_is_not_a_payment_id");
    const email = row.customer?.email;
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      throw Error("customer_email_missing");
    const kind = action === "renewed" ? "approved" : action;
    let paidAt = null;
    if (kind === "approved") {
      // An active/created/renewed subscription alone is NOT proof of payment.
      if (row.status !== "paid" || row.refundedAt || row.chargedbackAt) { skipped++; continue; }
      paidAt = paymentDate(row.paidAt, now);
      if (!paidAt) throw Error("original_payment_date_required");
    }
    // Same payment seen in purchase_approved AND renewal remains one grant.
    const key = "cakto:v1:" + await sha(JSON.stringify([PRODUCT_ID, row.id, kind]));
    calls.push({ event_key: key, purchase_id: row.id, product: PRODUCT_ID,
      buyer_email: email.trim().toLowerCase(), event_kind: kind, approved_at: paidAt });
  }
  return { calls, skipped };
}
// This is intentionally NOT a fake HTTP adapter or an endpoint guessed from
// memory. Implement only after confirming Cakto's official API and response.
async function lookupCaktoProductionPayment(_transactionId) {
  throw Error("cakto_api_adapter_not_configured");
}
async function verifyCallsWithCakto(calls, lookup) {
  const verified=[];
  for(const hint of calls){
    // `lookup` is server-side code, never a JSON field, URL, or client callback.
    const receipt=await lookup(hint.purchase_id);
    if(!record(receipt)||receipt.source!=="cakto_api"||receipt.environment!=="production"||receipt.isTest!==false||receipt.merchantVerified!==true)
      throw Error("production_payment_not_verified");
    if(receipt.transactionId!==hint.purchase_id||receipt.productId!==PRODUCT_ID||
      typeof receipt.email!=="string"||receipt.email.trim().toLowerCase()!==hint.buyer_email)
      throw Error("api_payment_identity_mismatch");
    let kind;
    if(receipt.status==="chargeback")kind="chargeback";
    else if(receipt.status==="refunded")kind="refunded";
    else if(receipt.status==="paid"&&hint.event_kind==="approved")kind="approved";
    else throw Error("payment_state_unconfirmed_retry");
    const paidAt=kind==="approved"?paymentDate(receipt.paidAt,Date.now()):null;
    if(kind==="approved"&&!paidAt)throw Error("api_original_payment_date_required");
    // Current API state wins over an old approved webhook, including refunds.
    const key="cakto:v1:"+await sha(JSON.stringify([PRODUCT_ID,receipt.transactionId,kind]));
    verified.push({event_key:key,purchase_id:receipt.transactionId,product:PRODUCT_ID,
      buyer_email:receipt.email.trim().toLowerCase(),event_kind:kind,approved_at:paidAt});
  }
  return verified;
}
export function createCaktoHandler(env, send = fetch, log = value => console.info(JSON.stringify(value)), lookup = lookupCaktoProductionPayment) {
  return async request => {
    if (request.method !== "POST") return reply(405, "post_required");
    const secret = env("CAKTO_WEBHOOK_SECRET");
    const mode = env("CAKTO_MODE") || "inspect";
    if (!secret || secret.length < 32 || !["inspect", "live"].includes(mode))
      return reply(503, "webhook_not_configured");
    const parsed = await readPayload(request);
    if (parsed.error) return parsed.error;
    const payload = parsed.payload;
    if (!await authenticate(payload.secret, secret)) return reply(401, "invalid_webhook_secret");
    if (!eventName(payload.event)) return reply(400, "invalid_event_name");
    if (mode === "inspect") return inspect(payload, log, lookup);
    let map;
    try { map = parseEventMap(env("CAKTO_EVENT_MAP")); }
    catch { return reply(503, "event_map_not_configured"); }
    const action = map.get(payload.event);
    if (!action) {
      log({ marker: "cakto_unmapped_event", event: payload.event });
      return reply(503, "event_not_configured");
    }
    if (action === "ignored") return reply(200, "ignored_non_payment_event");
    let prepared;
    try { prepared = await normalize(rowsOf(payload), action, Date.now()); }
    catch (error) { return reply(422, error.message); }
    if (action === "cancelled") return reply(200, "cancellation_preserves_paid_period");
    if (prepared.calls.length === 0) return reply(200, "no_eligible_payment");
    const base = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
    // The service key must only ever be sent to this project's HTTPS backend.
    if (!base || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !key)
      return reply(503, "backend_not_configured");
    // No RPC is invoked unless every candidate is verified independently.
    try { prepared.calls=await verifyCallsWithCakto(prepared.calls,lookup); }
    catch { return reply(503,"cakto_api_validation_required_retry"); }
    for (const call of prepared.calls) {
      let response;
      try {
        response = await send(base + "/rest/v1/rpc/apply_payment_event", {
          method: "POST", signal: AbortSignal.timeout(15000),
          headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify(call),
        });
      } catch { return reply(503, "payment_persistence_failed_retry"); }
      if (!response.ok) {
        // No response bodies in logs: they may contain buyer/order data.
        log({ marker: "cakto_rpc_failed", event: payload.event, http_status: response.status });
        return reply(503, "payment_persistence_failed_retry");
      }
    }
    return reply(200, "processed", { processed: prepared.calls.length, skipped: prepared.skipped });
  };
}

