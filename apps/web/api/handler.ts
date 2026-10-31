import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle } from 'hono/vercel';
import { app } from '../api-dist/app.js';

// Node runtime (explicit handler types pin nodeVersion): scrypt + postgres need Node APIs.
export default handle(app) as unknown as (req: VercelRequest, res: VercelResponse) => Promise<void>;
