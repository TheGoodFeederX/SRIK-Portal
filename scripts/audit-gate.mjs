// Fails CI when a high-severity advisory is not explicitly allowlisted (spec v1.1 §90).
import { readFileSync } from 'node:fs';

const ALLOWED = new Set(
  (process.env.AUDIT_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

let report;
try {
  report = JSON.parse(readFileSync('audit.json', 'utf8'));
} catch {
  console.error('audit.json missing — run `pnpm audit --json > audit.json` first');
  process.exit(1);
}

const advisories = new Map();
for (const [name, entry] of Object.entries(report.advisories ?? {})) {
  const severity = entry.severity ?? 'unknown';
  if (severity === 'high' || severity === 'critical') advisories.set(String(entry.github_advisory_id ?? name), `${name}: ${severity}`);
}
// pnpm 10 reports through `vulnerabilities` instead of `advisories` in some versions.
for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
  if (entry.severity === 'high' || entry.severity === 'critical') advisories.set(name, `${name}: ${entry.severity}`);
}

const blocking = [...advisories.entries()].filter(([id]) => !ALLOWED.has(id));
for (const [, label] of advisories) console.log(`audit: ${label}${blocking.some(([, l]) => l === label) ? ' (blocking)' : ' (allowlisted)'}`);
if (blocking.length) {
  console.error(`::error::${blocking.length} high/critical advisory(ies) not allowlisted`);
  process.exit(1);
}
console.log('dependency audit gate passed');
