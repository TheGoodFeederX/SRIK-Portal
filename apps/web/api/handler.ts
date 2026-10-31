import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handle } from "hono/vercel";

// Declared through VercelRequest/VercelResponse so the runtime is pinned to nodeVersion 22.x
// (edge/Node 24 builds cannot run scrypt + postgres).
import { app } from "../src/server/app.ts";

export default handle(app) as unknown as (req: VercelRequest, res: VercelResponse) => Promise<void>;
