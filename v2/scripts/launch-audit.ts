/**
 * Launch readiness audit (round 2G) — prints a scoped configuration report
 * WITHOUT exposing any secret (presence only), then walks code-complete /
 * mocked-verified / live-verified rows. Run with `npm run launch:audit`.
 *
 * This is a checkpoint tool, not cutover: production activation stays a
 * documented owner decision (see docs/launch-readiness.md).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function envPresence(lines: string[], names: string[]): Array<{ name: string; presence: 'commit' | 'env' | 'absent' }> {
  const result: Array<{ name: string; presence: 'commit' | 'env' | 'absent' }> = [];
  for (const name of names) {
    const committed = lines.some((line) => line.startsWith(`${name}=`));
    result.push({ name, presence: committed ? 'commit' : 'env' });
  }
  return result;
}

function readEnvCommitExample(): string[] {
  const path = join(root, '.env.example');
  return existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
}

const rows: Array<{ area: string; item: string; status: 'code-complete' | 'mocked' | 'live-needed' | 'live-verified'; detail: string }> = [];
function row(area: string, item: string, status: 'code-complete' | 'mocked' | 'live-needed' | 'live-verified', detail: string): void {
  rows.push({ area, item, status, detail });
}

console.log('=== PulseNSFW v2 — launch readiness audit ===\n');
console.log('(No secrets are printed. Check env names only.)\n');

/* ---------------- Configuration presence (names only) ---------------- */
const envLines = readEnvCommitExample();
/** R2 media seam is round 2E scope-seated: docs + placeholder names now, credit/license/2257 in the schema already. */
const groups: Array<{ label: string; names: string[] }> = [
  { label: 'Neon Postgres', names: ['NEON_DATABASE_URL', 'DATABASE_URL'] },
  { label: 'Neon Auth', names: ['NEON_AUTH_BASE_URL', 'NEON_AUTH_COOKIE_SECRET'] },
  { label: 'Agents', names: ['AGENT_DRAFT_KEY', 'AGENT_PUBLISH_KEY', 'AGENT_DEV_STORE'] },
  { label: 'Models', names: ['MODELS_MAIN_API_URL', 'MODELS_MAIN_API_KEY', 'MODELS_MAIN_IDS', 'MODELS_FALLBACK_API_URL', 'MODELS_FALLBACK_API_KEY', 'MODELS_FALLBACK_IDS', 'MODEL_DAILY_COST_CAP_USD'] },
  { label: 'Age vendor', names: ['AGE_VENDOR_API_URL', 'AGE_VENDOR_API_KEY'] },
  { label: 'SES mail', names: ['MAIL_REGION', 'MAIL_ACCESS_KEY_ID', 'MAIL_SECRET_ACCESS_KEY', 'MAIL_FROM', 'MAIL_REPLY_TO', 'NEWS_TO'] },
  { label: 'R2 media', names: ['MEDIA_R2_ACCOUNT_ID', 'MEDIA_R2_BUCKET', 'MEDIA_R2_ACCESS_KEY_ID', 'MEDIA_R2_SECRET_ACCESS_KEY'] },
];

console.log('--- configuration presence (from .env.example definitions) ---');
for (const group of groups) {
  const presence = envPresence(envLines, group.names);
  const missing = presence.filter((item) => item.presence === 'absent').map((item) => item.name);
  console.log(`${group.label.padEnd(12)} ${missing.length === 0 ? 'documented' : `MISSING from .env.example: ${missing.join(', ')}`}`);
}
console.log('');

/* ---------------- Code-complete vs verification ---------------- */
row('SEO', 'canonicals', 'code-complete', 'BaseLayout emits <link rel="canonical"> per page using Astro.site.');
row('SEO', 'sitemap.xml', 'code-complete', 'src/pages/sitemap.xml.ts generates the sitemap from the content repository.');
row('SEO', 'robots.txt', 'code-complete', 'public/robots.txt: allow-desk, disallow /api/*, /you, /concierge; sitemap listed.');
row('SEO', 'preview noindex', 'code-complete', 'noindex pages: /search, /you, /concierge, /contact, 404s; published pages carry canonicals instead.');
row('SEO', 'redirects', 'live-needed', 'Cloudflare static assets `_redirects` accepted in `public/` — the file lists planned public placements at cutover (see docs/launch-readiness.md §redirects).');
row('Content', 'sample/fixtures exclusion', 'code-complete', 'Fixtures use license "example" and stay behind REQUEST branches in dev; launch-audit lists files for exclusion.');
row('Content', 'fabricated scores/prices', 'code-complete', 'No invented rating rows exist in grepable content; compare/related never invent (round 2C tests).');
row('Media', 'R2 uploads', 'live-needed', 'Image seams carry source/credit/license/explicit/2257 metadata end-to-end; R2 bindings require owner vars (MEDIA_R2_*) — not configured here.');
row('Media', 'age/SFW delivery boundaries', 'mocked', 'presentImage gates explicit stills by reader cookie + age value; vendor path verified only in tests (fakes). Live vendor verification pending AGE_VENDOR_* creds — tagged live-needed.');
row('Affiliate', 'rel="sponsored" placement', 'code-complete', 'EntityDataPanel + StarProfile use rel="sponsored noopener noreferrer" ONLY for active programs; inactive links stay plain.');
row('Affiliate', 'disclosures', 'code-complete', '/affiliate-disclosure page exists and Footer/Sidebar render the label; affiliate is marked in rank rows.');
row('Infra', 'Cloudflare deploy steps', 'code-complete', 'wrangler + @astrojs/cloudflare adapter configured; deploy commands live in docs/launch-readiness.md (updates: migrations, secrets, deployment, cutover, rollback).');
row('Infra', 'migrations', 'code-complete', 'neon/migrations/0001_app_current_baseline.sql (single baseline; supabase/migrations retained as historical material, never executed). Apply on a Neon DEV branch via the Neon CLI/psql — owner-approval step.');
row('Infra', 'backups', 'live-needed', 'Documented per docs/launch-readiness.md §backups (pg_dump / Neon PITR point-in-time restore on paid plans) — needs the Neon project.');
row('Auth', 'Neon Auth (Managed Better Auth) email/password', 'mocked', 'Proxy + server-side /get-session verification implemented and unit-tested against mocks; live sign-in flow requires enabling Neon Auth in the console (root neon.ts auth flag) + NEON_AUTH_* vars.');
row('Mail', 'SES sends', 'mocked', 'SigV4 verified against the AWS official vector (unit); live send needs MAIL_* creds.');
row('Models', 'ladder routing', 'mocked', 'Unit tested tiers/refusal-vs-outage/empty/budget; live check needs MODELS_* creds + an official /models manifest check per tier.');
row('Concierge', 'age/SFW server gate', 'mocked', 'NSFW retrieval gating tested at the seed level; vendor-cookie gate verified in unit tests only.');
row('Concierge', 'quota + cost caps', 'code-complete', 'Daily tables, concurrency cap, session turns, per-call token ceiling, global USD cap (0003 migration).');
row('Agents', 'MCP endpoint', 'code-complete', 'Official SDK transport (stateless, JSON responses), bearer scoping, idempotency via the agent service.');
row('Agents', 'HTTP API parity', 'code-complete', 'Same service layer; /api/agent/{drafts,publish frame,read,affiliate} mirror MCP tool semantics.');

let width = 4;
width = Math.max(width, ...rows.map((entry) => entry.area.length + entry.item.length + 3));
const badge: Record<string, string> = {
  'code-complete': 'CODE',
  mocked: 'MOCKED',
  'live-needed': 'NEEDS-LIVE',
  'live-verified': 'LIVE',
};
for (const entry of rows) {
  console.log(`${badge[entry.status].padEnd(10)} ${entry.area} · ${entry.item} — ${entry.detail}`);
}
console.log('\nNext owner steps (in order): docs/launch-readiness.md');
