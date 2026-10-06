import { kv, readBody, normCode, pushLog, OWNER_KEY } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  if (!kv.ensureKv(res)) return;
  try {
    const body = await readBody(req);
    const typed = String(body.code || '').trim();

    // Lifetime owner key — works on every device, never expires, never burns.
    if (typed === OWNER_KEY) {
      await pushLog('OWNER', 'Owner', 'owner login');
      return res.status(200).json({ ok: true, owner: true, name: 'Owner' });
    }

    const code = normCode(typed);
    const raw = await kv.hget('bf:codes', code);
    if (!raw) return res.status(200).json({ ok: false, error: 'Invalid code. Check it and try again.' });
    const c = JSON.parse(raw);
    if (c.used) return res.status(200).json({ ok: false, error: 'This code was already used — codes work exactly once.' });
    if (Date.now() > c.expiresAt) return res.status(200).json({ ok: false, error: 'This code has expired. Ask the owner for a fresh one.' });
    c.used = true;
    c.usedAt = Date.now();
    await kv.hset('bf:codes', code, c);
    await pushLog(code, c.name || 'Guest', 'redeemed');
    return res.status(200).json({ ok: true, owner: false, name: c.name || 'Guest', code });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'server error' });
  }
}
