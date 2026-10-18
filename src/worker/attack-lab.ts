import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { bodyLimit } from 'hono/body-limit';
import { createAttackDb, DEMO_CUSTOMERS, loginQuery, searchQuery, type LabIdentity } from './attack-db';
import type { Bindings } from './config';

export function attackLabConfigured(env: Partial<Bindings>, hostname: string): boolean {
  if (env.ATTACK_LAB_ENABLED !== 'true' || env.LAB_SYNTHETIC_ONLY !== 'true'
    || (env.ATTACK_LAB_SESSION_SECRET?.length ?? 0) < 32) return false;
  return (env.APP_ENV === 'lab' && env.PUBLIC_DEMO_ENABLED === 'true' && env.LAB_ENABLED === 'true'
    && hostname === 'democommerce-lab.democommerce.workers.dev')
    || (import.meta.env.DEV && env.APP_ENV === 'local' && ['localhost', '127.0.0.1'].includes(hostname));
}

const encoder = new TextEncoder();
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function unb64(value: string) { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)); }
async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function issue(identity: LabIdentity, secret: string) {
  const body = b64(encoder.encode(JSON.stringify({ ...identity, exp: Date.now() + 30 * 60_000 })));
  const mac = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(body));
  return `${body}.${b64(new Uint8Array(mac))}`;
}
async function readIdentity(token: string | undefined, secret: string): Promise<LabIdentity | null> {
  try {
    if (!token || token.length > 2048) return null;
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra || !await crypto.subtle.verify('HMAC', await signingKey(secret), unb64(signature), encoder.encode(body))) return null;
    const value = JSON.parse(new TextDecoder().decode(unb64(body)));
    return Number.isInteger(value.id) && typeof value.email === 'string' && ['customer', 'admin'].includes(value.role) && value.exp > Date.now() ? value : null;
  } catch { return null; }
}

export const attackLab = new Hono<{ Bindings: Bindings; Variables: { viewer: LabIdentity } }>();
attackLab.onError((error, c) => {
  console.error('Isolated lab engine failed:', error.message);
  return c.json({ error: 'LAB_ENGINE_UNAVAILABLE', synthetic: true }, 503);
});
attackLab.use('*', bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: 'INPUT_TOO_LARGE' }, 413) }));
attackLab.use('*', async (c, next) => {
  if (!attackLabConfigured(c.env, new URL(c.req.url).hostname)) return c.json({ error: 'LAB_DISABLED' }, 404);
  c.header('Cache-Control', 'no-store');
  c.header('X-Demo-Data', 'synthetic-only');
  if (c.req.method === 'POST') {
    const origin = c.req.header('Origin');
    if (origin !== new URL(c.req.url).origin) return c.json({ error: 'ORIGIN_REJECTED' }, 403);
    if ((Number(c.req.header('Content-Length') ?? 0)) > 4096) return c.json({ error: 'INPUT_TOO_LARGE' }, 413);
  }
  await next();
});
attackLab.get('/status', (c) => c.json({ enabled: true, synthetic: true, customerCount: 102,
  cases: ['SQLI-LOGIN', 'SQLI-SEARCH', 'IDOR', 'ROLE-TAMPERING', 'EXCESSIVE-DATA', 'PATH-TRAVERSAL', 'WEAK-PASSWORD', 'PUBLIC-BACKUP', 'DEBUG-CONFIG', 'REFLECTED-XSS'],
  engine: 'SQLite WASM / request-local / no external DB access' }));
attackLab.get('/backups/customers.json', (c) => c.json({ synthetic: true, customers: DEMO_CUSTOMERS, count: 102, marker: 'DEMO_PUBLIC_BACKUP_102' }));
attackLab.get('/debug/config', (c) => c.json({ synthetic: true, debug: true, version: 'vulnerable-lab-1',
  DEMO_ADMIN_EMAIL: 'admin@example.test', DEMO_ADMIN_PASSWORD: 'admin',
  DEMO_API_KEY: 'DEMO-INVALID-KEY-NOT-A-REAL-CREDENTIAL',
  database: { engine: 'request-local SQLite', tables: ['lab_users', 'lab_customers'], customer_count: 102 },
  backup_path: '/api/attack-lab/backups/customers.json', marker: 'DEMO_DEBUG_CONFIG_EXPOSED' }));
attackLab.get('/reflection', (c) => {
  const query = c.req.query('q') ?? '';
  if (query.length > 512) return c.text('Input too long', 400);
  // Intentionally unescaped HTML, confined by both CSP sandbox and iframe.
  // No same-origin authority, cookies, network requests, popups or navigation.
  c.header('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'");
  c.header('X-Frame-Options', 'SAMEORIGIN');
  return c.html(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>DemoCommerce XSS Lab</title><style>body{font:16px system-ui;padding:24px;color:#243f32;background:#f6f3e8}#proof{padding:16px;border:1px solid #929b88}</style><h1>反射型XSS / 隔離画面</h1><p>架空データ専用。スクリプトはこの画面内だけで実行されます。</p><div id="proof">スクリプトの実行結果がここに出ます</div><div>${query}</div></html>`);
});
attackLab.post('/login', async (c) => {
  const raw = await c.req.text();
  if (raw.length > 4096) return c.json({ error: 'INPUT_TOO_LARGE' }, 413);
  let input: { email?: unknown; password?: unknown; mode?: unknown };
  try { input = JSON.parse(raw); } catch { return c.json({ error: 'INVALID_INPUT' }, 400); }
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || input.email.length > 256 || input.password.length > 256
    || !['vulnerable', 'fixed'].includes(String(input.mode))) return c.json({ error: 'INVALID_INPUT' }, 400);
  const { attackSql } = await import('./attack-sql');
  const db = createAttackDb(await attackSql);
  try {
    const result = loginQuery(db, input.email, input.password, input.mode === 'fixed');
    const row = result.rows[0];
    if (!row || ![1, 2, 103].includes(Number(row.id))) return c.json({ error: 'LOGIN_FAILED', synthetic: true, query: result.sql }, 401);
    const identity = { id: Number(row.id), email: String(row.email), role: String(row.role) };
    if (input.mode === 'fixed' && identity.id === 103) return c.json({ error: 'WEAK_DEMO_ACCOUNT_DISABLED' }, 401);
    setCookie(c, 'attack_lab_session', await issue(identity, c.env.ATTACK_LAB_SESSION_SECRET!), {
      httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/api/attack-lab', maxAge: 1800,
    });
    return c.json({ synthetic: true, viewer: identity, query: result.sql, marker: 'DEMO_SQL_LOGIN_SUCCESS' });
  } catch { return c.json({ error: 'SQL_SYNTAX_ERROR', synthetic: true }, 400); }
  finally { db.close(); }
});
attackLab.post('/logout', (c) => { deleteCookie(c, 'attack_lab_session', { path: '/api/attack-lab' }); return c.json({ ok: true }); });
attackLab.use('*', async (c, next) => {
  const viewer = await readIdentity(getCookie(c, 'attack_lab_session'), c.env.ATTACK_LAB_SESSION_SECRET!);
  if (!viewer) return c.json({ error: 'LOGIN_REQUIRED' }, 401);
  c.set('viewer', viewer);
  await next();
});
attackLab.get('/me', (c) => c.json({ viewer: c.get('viewer'), synthetic: true }));
attackLab.get('/customers/:id', (c) => {
  const customer = DEMO_CUSTOMERS.find((row) => row.id === Number(c.req.param('id')));
  if (!customer || (c.req.query('mode') === 'fixed' && c.get('viewer').role !== 'admin' && customer.id !== c.get('viewer').id)) return c.json({ error: 'NOT_FOUND' }, 404);
  return c.json({ synthetic: true, customer, marker: 'DEMO_IDOR_CUSTOMER' });
});
attackLab.get('/search', async (c) => {
  const term = c.req.query('q') ?? '';
  if (term.length > 256) return c.json({ error: 'INPUT_TOO_LARGE' }, 400);
  const { attackSql } = await import('./attack-sql');
  const db = createAttackDb(await attackSql);
  try {
    const result = searchQuery(db, term, c.req.query('mode') === 'fixed');
    return c.json({ synthetic: true, ...result, count: result.rows.length });
  } catch { return c.json({ error: 'SQL_SYNTAX_ERROR', synthetic: true }, 400); }
  finally { db.close(); }
});
attackLab.get('/admin/export', (c) => {
  const role = c.req.query('mode') === 'fixed' ? c.get('viewer').role : (c.req.query('role') ?? c.get('viewer').role);
  if (role !== 'admin') return c.json({ error: 'ADMIN_REQUIRED' }, 403);
  return c.json({ synthetic: true, customers: DEMO_CUSTOMERS, count: DEMO_CUSTOMERS.length, marker: 'DEMO_CUSTOMER_EXPORT_102' });
});
attackLab.get('/profile', (c) => {
  const customer = DEMO_CUSTOMERS.find((row) => row.id === c.get('viewer').id) ?? DEMO_CUSTOMERS[0];
  return c.json({ synthetic: true, customer: c.req.query('mode') === 'fixed'
    ? { id: customer.id, full_name: customer.full_name } : customer });
});
attackLab.get('/download', (c) => {
  const file = c.req.query('file') ?? 'summary.json';
  if (file.length > 256) return c.json({ error: 'INVALID_FILE' }, 400);
  if (c.req.query('mode') === 'fixed' && file !== 'summary.json') return c.json({ error: 'FILE_REJECTED' }, 403);
  // Virtual documents only. Never read the OS, bindings, env, or a URL.
  const path = new URL(file, 'https://virtual.invalid/reports/').pathname;
  if (path === '/backups/customers.json') return c.json({ synthetic: true, customers: DEMO_CUSTOMERS, count: 102, marker: 'DEMO_BACKUP_EXPOSED' });
  if (path === '/reports/summary.json') return c.json({ synthetic: true, summary: '架空ストアの公開レポート' });
  return c.json({ error: 'NOT_FOUND' }, 404);
});
