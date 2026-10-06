import { kv, requireOwner, readBody, aiCall } from './_lib.js';

const KEY = 'bf:ai:config';

async function getCfg() {
  const raw = await kv.get(KEY);
  return raw
    ? JSON.parse(raw)
    : { enabled: false, endpoint: '', apiKey: '', model: '', guestLimit: 10 };
}

export default async function handler(req, res) {
  if (!kv.ensureKv(res)) return;
  try {
    // Public status for the site widget — no secrets.
    if (req.method === 'GET' && req.query.public === '1') {
      const c = await getCfg();
      return res.status(200).json({
        enabled: !!c.enabled,
        configured: !!(c.endpoint && c.apiKey),
        guestLimit: c.guestLimit || 10,
      });
    }
    if (!requireOwner(req, res)) return;

    if (req.method === 'GET') {
      const c = await getCfg();
      return res.status(200).json({
        enabled: !!c.enabled,
        endpoint: c.endpoint || '',
        hasKey: !!c.apiKey,
        model: c.model || '',
        guestLimit: c.guestLimit || 10,
      });
    }
    if (req.method === 'POST' && req.query.test === '1') {
      const c = await getCfg();
      if (!c.endpoint || !c.apiKey) return res.status(400).json({ error: 'Set the API endpoint and key first.' });
      await aiCall(c, 'Reply with the single word: online');
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const prev = await getCfg();
      const key = String(body.apiKey || '');
      const c = {
        enabled: !!body.enabled,
        endpoint: String(body.endpoint || '').slice(0, 300),
        apiKey: key || prev.apiKey || '',
        model: String(body.model || '').slice(0, 100),
        guestLimit: Math.max(1, parseInt(body.guestLimit, 10) || 10),
      };
      await kv.set(KEY, c);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'server error' });
  }
}
