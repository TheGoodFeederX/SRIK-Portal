import { handle } from 'hono/vercel';
import { app } from '../src/app.ts';

// Default Node runtime (pin via project settings): scrypt + postgres-js need Node APIs, not edge.
export const config = { runtime: 'nodejs' };

export default handle(app);
