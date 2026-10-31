// Makes the API use the exact drizzle-orm instance that @srik/db was built against.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const pkg = path.join(root, 'node_modules/drizzle-orm/package.json');
if (!fs.existsSync(pkg)) process.exit(0);
const dist = path.join(root, 'node_modules/@srik/api-vendor/drizzle-orm');
fs.rmSync(path.join(root, 'node_modules/@srik/api-vendor'), { recursive: true, force: true });
fs.mkdirSync(path.dirname(dist), { recursive: true });
fs.cpSync(path.join(root, 'node_modules/drizzle-orm'), dist, { recursive: true });
console.log('pinned drizzle-orm for @srik/api');
