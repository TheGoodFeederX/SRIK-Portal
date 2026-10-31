import { handle } from 'hono/vercel';
import { app } from '../src/app.ts';

// ponytail: Node runtime (not edge) because scrypt + postgres-js need Node APIs.
export const config = { runtime: 'nodejs22.x' };

export default handle(app);
