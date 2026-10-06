import { kvAvailable } from './_lib.js';

export default async function handler(req, res) {
  res.status(200).json({ ok: true, kv: kvAvailable(), time: Date.now() });
}
