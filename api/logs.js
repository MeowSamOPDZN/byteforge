import { kv, requireOwner, readBody, pushLog } from './_lib.js';

const parse = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };

export default async function handler(req, res) {
  if (!kv.ensureKv(res)) return;
  try {
    if (req.method === 'GET') {
      if (!requireOwner(req, res)) return;
      const raw = await kv.lrange('bf:logs', 0, 199);
      return res.status(200).json(raw.map(parse).filter(Boolean));
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      await pushLog(
        String(body.code || '—').slice(0, 40),
        String(body.name || 'Guest').slice(0, 60),
        String(body.event || '').slice(0, 120)
      );
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      if (!requireOwner(req, res)) return;
      await kv.del('bf:logs');
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'server error' });
  }
}
