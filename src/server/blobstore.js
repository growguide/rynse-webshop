// Minimal Vercel Blob client (private store) on plain fetch — no SDK, keeps the repo dependency-free.
// Mirrors the REST calls of @vercel/blob 2.x: PUT /?pathname=… to store, GET ?prefix=… to list,
// GET <blob url> with the token to read. Needs BLOB_READ_WRITE_TOKEN (set when a Blob store is
// connected to the Vercel project).
const API = process.env.VERCEL_BLOB_API_URL || 'https://vercel.com/api/blob';
const API_VERSION = '13';

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function auth() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  const storeId = token.split('_')[3] || '';
  return { token, storeId };
}

async function call(pathAndQuery, init = {}) {
  const { token, storeId } = auth();
  const res = await fetch(`${API}${pathAndQuery}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'x-api-version': API_VERSION, 'x-vercel-blob-store-id': storeId, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Blob API ${init.method || 'GET'} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Store a small private JSON document at a fixed pathname (overwrites). */
export async function putJson(pathname, data) {
  const body = JSON.stringify(data);
  return call(`/?${new URLSearchParams({ pathname })}`, {
    method: 'PUT',
    body,
    headers: { 'x-vercel-blob-access': 'private', 'x-content-type': 'application/json', 'x-add-random-suffix': '0', 'x-allow-overwrite': '1', 'x-content-length': String(Buffer.byteLength(body)) },
  });
}

/** List all blobs under a prefix. */
export async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const q = new URLSearchParams({ prefix, limit: '1000' });
    if (cursor) q.set('cursor', cursor);
    const r = await call(`?${q}`);
    out.push(...(r.blobs || []));
    cursor = r.hasMore ? r.cursor : null;
  } while (cursor);
  return out;
}

/** Read a private JSON blob by its URL. */
export async function readJsonBlob(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${auth().token}` } });
  if (!res.ok) throw new Error(`Blob read failed: ${res.status}`);
  return res.json();
}
