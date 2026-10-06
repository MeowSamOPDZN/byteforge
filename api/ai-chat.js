import { kv, readBody, aiCall } from './_lib.js';

const CFG_KEY = 'bf:ai:config';

async function getCfg() {
  const raw = await kv.get(CFG_KEY);
  return raw ? JSON.parse(raw) : null;
}

export default async function handler(req, res) {
  if (!kv.ensureKv(res)) return;
  try {
    const cfg = await getCfg();

    if (req.method === 'GET' && req.query.remaining === '1') {
      const guestId = String(req.query.guestId || 'guest').slice(0, 80);
      const used = parseInt((await kv.get('bf:ai:use:' + guestId)) || '0', 10);
      return res.status(200).json({ remaining: Math.max(0, (cfg.guestLimit || 10) - used) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    if (!cfg || !cfg.enabled) return res.status(400).json({ error: 'The AI switch is off.' });
    if (!cfg.endpoint || !cfg.apiKey) return res.status(400).json({ error: 'AI API is not connected.' });

    const body = await readBody(req);
    const owner = !!body.owner;
    const guestId = String(body.guestId || 'guest').slice(0, 80);
    const ukey = 'bf:ai:use:' + guestId;
    let used = 0;
    if (!owner) {
      used = await kv.incr(ukey);
      if (used === 1) await kv.expire(ukey, 90 * 24 * 3600); // hygiene: counters fade after 90 days
      if (used > (cfg.guestLimit || 10)) {
        return res.status(403).json({ error: 'You are out of chats. Ask the owner for more.' });
      }
    }
    const reply = await aiCall(cfg, body.message || '');
    const remaining = owner ? -1 : Math.max(0, (cfg.guestLimit || 10) - used);
    return res.status(200).json({ reply, remaining });
  } catch (e) {
    res.status(500).json({ error: e.message || 'server error' });
  }
}
