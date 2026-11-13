let accountId = null;
export const accountChanges = new EventTarget();
export function selectAccount(id) {
  if (id !== null && !/^[0-9a-f-]{36}$/i.test(id)) throw Error('Identificador de conta inválido.');
  accountId = id;
}
export const hasAccount = () => accountId !== null;
export const habitsKey = () => accountId ? `habitkit:account:${accountId}` : 'habitkit';
export const visionDatabase = () => accountId ? `habitkit-identity:${accountId}` : 'habitkit-identity';
export function markAccountChanged() { if (accountId) accountChanges.dispatchEvent(new Event('change')); }
export async function readVision(name = visionDatabase()) {
  const db = await openVision(name);
  try { return await new Promise((ok, no) => { const r = db.transaction('workspace').objectStore('workspace').get('current'); r.onsuccess = () => ok(r.result ?? null); r.onerror = () => no(r.error); }); }
  finally { db.close(); }
}
function openVision(name) {
  return new Promise((ok, no) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore('workspace'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); r.onblocked = () => no(Error('Feche as outras abas do aplicativo.')); });
}
export async function writeVision(value) {
  const db = await openVision(visionDatabase());
  try { await new Promise((ok, no) => { const tx = db.transaction('workspace', 'readwrite'); if (value === null) tx.objectStore('workspace').delete('current'); else tx.objectStore('workspace').put(value, 'current'); tx.oncomplete = ok; tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error); }); }
  finally { db.close(); }
}
