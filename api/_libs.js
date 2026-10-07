// ByteForge API shared helpers — zero dependencies.
// Uses the Upstash Redis REST API (what Vercel KV is backed by).
// Required env vars (added automatically by the Vercel KV integration):
//   KV_REST_API_URL, KV_REST_API_TOKEN
// Optional: OWNER_KEY (defaults to the lifetime owner key below).

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const OWNER_KEY = process.env.OWNER_KEY || 'HardikSri@123';

export function kvAvailable() {
  return !!(KV_URL && KV_TOKEN);
}

async function redis(...args) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new Error('KV error: ' + data.error);
  return data.result;
}

const J = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

export const kv = {
  redis,
  ensureKv(res) {
    if (!kvAvailable()) {
      res.status(500).json({ error: 'KV not connected. Create a Vercel KV store and redeploy.' });
      return false;
    }
    return true;
  },
  get: (k) => redis('GET', k),
  set: (k, v) => redis('SET', k, J(v)),
  del: (k) => redis('DEL', k),
  hget: (k, f) => redis('HGET', k, f),
  hset: (k, f, v) => redis('HSET', k, f, J(v)),
  hdel: (k, f) => redis('HDEL', k, f),
  hgetall: async (k) => {
    const arr = (await redis('HGETALL', k)) || [];
    const out = {};
    for (let i = 0; i < arr.length; i += 2) out[arr[i]] = arr[i + 1];
    return out;
  },
  lpush: (k, v) => redis('LPUSH', k, J(v)),
  lrange: (k, a, b) => redis('LRANGE', k, a, b),
  ltrim: (k, a, b) => redis('LTRIM', k, a, b),
  incr: (k) => redis('INCR', k),
  expire: (k, s) => redis('EXPIRE', k, s),
};

export function requireOwner(req, res) {
  if (req.headers['x-owner-key'] !== OWNER_KEY) {
    res.status(401).json({ error: 'owner only' });
    return false;
  }
  return true;
}

export function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = new Uint8Array(8);
  crypto.getRandomValues(rnd);
  let p = '';
  for (let i = 0; i < 8; i++) p += A[rnd[i] % A.length];
  return p.slice(0, 4) + '-' + p.slice(4);
}

export function normCode(s) {
  // Guest codes: case-insensitive, dashes/spaces optional ("abcd1234" == "ABCD-1234").
  // The owner key is checked separately with exact case BEFORE this ever runs.
  return String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function pushLog(code, name, event) {
  try {
    await kv.lpush('bf:logs', { ts: Date.now(), code, name, event });
    await kv.ltrim('bf:logs', 0, 1999);
  } catch (e) {}
}

export function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

/* OpenAI-compatible chat call (used by ai-chat + ai-config test). */
export async function aiCall(cfg, message) {
  let base = String(cfg.endpoint || '').trim().replace(/\/+$/, '');
  if (!/\/chat\/completions$/.test(base)) base += '/chat/completions';
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify({
      model: cfg.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are ByteForge AI, the experimental assistant inside the ByteForge private tools site. Keep answers short and direct.' },
        { role: 'user', content: String(message).slice(0, 4000) },
      ],
      max_tokens: 600,
      temperature: 0.7,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('AI API error (' + r.status + '): ' + t.slice(0, 200));
  }
  const j = await r.json().catch(() => ({}));
  const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!txt) throw new Error('AI returned an empty reply.');
  return txt.trim();
}
