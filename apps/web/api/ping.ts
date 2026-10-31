import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function ping(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, node: process.version });
}
