import { kv, requireOwner, readBody, genCode } from './_lib.js';

const KEY = 'bf:codes';
const parse = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };

export default async function handler(req, res) {
  if (!kv.ensureKv(res)) return;
  try {
    if (req.method === 'GET') {
      if (!requireOwner(req, res)) return;
      const all = await kv.hgetall(KEY);
      const list = Object.values(all).map(parse).filter(Boolean)
        .sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json(list);
    }
    if (req.method === 'POST') {
      if (!requireOwner(req, res)) return;
      const body = await readBody(req);
      const mins = Math.max(1, parseInt(body.minutes, 10) || 60);
      let code = genCode(), guard = 0;
      while ((await kv.hget(KEY, code)) && guard++ < 20) code = genCode();
      const c = {
        code,
        name: String(body.name || 'Guest').slice(0, 60),
        createdAt: Date.now(),
        expiresAt: Date.now() + mins * 60000,
        used: false,
        usedAt: null,
      };
      await kv.hset(KEY, code, c);
      return res.status(200).json({ code });
    }
    if (req.method === 'DELETE') {
      if (!requireOwner(req, res)) return;
      await kv.hdel(KEY, String(req.query.code || ''));
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'server error' });
  }
}
