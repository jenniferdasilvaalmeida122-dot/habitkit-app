// Keep image bytes in private Storage, rather than duplicating them in every save.
const imageData = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
export async function packImages(document, userId, upload) {
  const copy = structuredClone(document), jobs = new Map();
  async function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && imageData.test(item)) {
        if (!jobs.has(item)) jobs.set(item, (async () => {
          const [, type, encoded] = item.match(imageData);
          const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
          if (bytes.length > 8 * 1024 * 1024) throw Error('Imagem maior que 8 MB.');
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
          const path = `${userId}/${hash}.${type}`;
          await upload(path, bytes, `image/${type}`);
          return `hk-storage://${path}`;
        })());
        value[key] = await jobs.get(item);
      } else if (typeof item === 'string' && item.startsWith('hk-storage://')) throw Error('Referência de imagem inesperada.');
      else await visit(item);
    }
  }
  await visit(copy); return copy;
}
export async function unpackImages(document, userId, download) {
  const copy = structuredClone(document), jobs = new Map();
  async function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && item.startsWith('hk-storage://')) {
        const path = item.slice(13);
        if (!new RegExp(`^${userId}/[a-f0-9]{64}\\.(png|jpeg|webp|gif)$`).test(path)) throw Error('Imagem fora da conta.');
        if (!jobs.has(path)) jobs.set(path, download(path));
        value[key] = await jobs.get(path);
      } else await visit(item);
    }
  }
  await visit(copy); return copy;
}
