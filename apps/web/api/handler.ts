import { handle } from 'hono/vercel';
import { app } from '../src/server/app.ts';

// Node runtime (not edge): scrypt + postgres need Node APIs.
export const config = { runtime: 'nodejs' };

export default handle(app);
