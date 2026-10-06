import { kv, requireOwner, readBody } from './_lib.js';

const KEY = 'bf:tools';
const clean = (v, n) => String(v || '').slice(0, n);
const cleanImages = (arr) =>
  (Array.isArray(arr) ? arr : []).filter((u) => /^https?:\/\//i.test(String(u))).map((u) => String(u).slice(0, 500)).slice(0, 12);

async function list() {
  const raw = await kv.get(KEY);
  return raw ? JSON.parse(raw) : [];
}
async function save(tools) {
  await kv.set(KEY, tools);
}

export default async function handler(req, res) {
  if (!kv.ensureKv(res)) return;
  try {
    if (req.method === 'GET') {
      const tools = await list();
      const { id } = req.query;
      if (id) {
        const t = tools.find((x) => x.id === id);
        return res.status(t ? 200 : 404).json(t || { error: 'not found' });
      }
      return res.status(200).json(tools);
    }
    if (!requireOwner(req, res)) return;
    const body = await readBody(req);

    if (req.method === 'POST') {
      const t = {
        id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name: clean(body.name, 120),
        cat: clean(body.cat, 60),
        url: clean(body.url, 500),
        icon: clean(body.icon, 8),
        desc: clean(body.desc, 600),
        images: cleanImages(body.images),
        createdAt: Date.now(),
      };
      if (!t.name || !t.url) return res.status(400).json({ error: 'name and url required' });
      const tools = await list();
      tools.unshift(t);
      await save(tools);
      return res.status(200).json(t);
    }
    if (req.method === 'PUT') {
      const { id } = req.query;
      const tools = await list();
      const i = tools.findIndex((x) => x.id === id);
      if (i < 0) return res.status(404).json({ error: 'not found' });
      const t = tools[i];
      const limits = { name: 120, cat: 60, url: 500, icon: 8, desc: 600 };
      for (const f of Object.keys(limits)) if (body[f] !== undefined) t[f] = clean(body[f], limits[f]);
      if (body.images !== undefined) t.images = cleanImages(body.images);
      await save(tools);
      return res.status(200).json(t);
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      await save((await list()).filter((x) => x.id !== id));
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'server error' });
  }
}
