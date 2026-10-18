import { beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { createAttackDb, loginQuery, searchQuery, selectRows } from '../../src/worker/attack-db';
import { attackLab, attackLabConfigured } from '../../src/worker/attack-lab';
import type { Bindings } from '../../src/worker/config';

vi.mock('../../src/worker/attack-sql', () => ({ attackSql: initSqlJs() }));
let SQL: SqlJsStatic;
beforeAll(async () => { SQL = await initSqlJs(); });
const origin = 'https://democommerce-lab.democommerce.workers.dev';
const env = { APP_ENV: 'lab', LAB_ENABLED: 'true', PUBLIC_DEMO_ENABLED: 'true',
  LAB_SYNTHETIC_ONLY: 'true', ATTACK_LAB_ENABLED: 'true',
  ATTACK_LAB_SESSION_SECRET: 'test-only-isolated-lab-signing-secret-32-chars' } as Bindings;
const request = (path: string, cookie = '', body?: unknown, bindings = env) => attackLab.request(`${origin}${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}, bindings);
async function login(email = 'buyer-b@example.test', password = 'demo-password', mode = 'vulnerable') {
  const response = await request('/login', '', { email, password, mode });
  return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

describe('isolated real SQLite injection', () => {
  it('evaluates boolean expressions and comments instead of matching payload strings', () => {
    const db = createAttackDb(SQL);
    try {
      expect(loginQuery(db, 'buyer-a@example.test', 'wrong', false).rows).toHaveLength(0);
      expect(loginQuery(db, "' OR 1=1 --", 'wrong', false).rows.length).toBe(3);
      expect(loginQuery(db, "' OR 'apple'='apple' --", 'wrong', false).rows.length).toBe(3);
      expect(loginQuery(db, "' OR 1=1 --", 'wrong', true).rows).toHaveLength(0);
      expect(loginQuery(db, 'buyer-b@example.test', 'demo-password', true).rows[0].id).toBe(2);
    } finally { db.close(); }
  });
  it('supports UNION extraction while parameterized search treats the same string as data', () => {
    const db = createAttackDb(SQL);
    try {
      const payload = "' UNION SELECT id,full_name,address FROM lab_customers --";
      expect(searchQuery(db, payload, false).rows).toHaveLength(102);
      expect(String(searchQuery(db, payload, false).rows[0].email)).toContain('架空県');
      expect(searchQuery(db, payload, true).rows).toHaveLength(0);
      expect(searchQuery(db, "' OR 1=1 --", false).rows).toHaveLength(102);
      expect(() => db.run('DELETE FROM lab_customers')).toThrow();
      searchQuery(db, "'; ATTACH DATABASE 'outside.sqlite' AS outside; --", false);
      expect(selectRows(db, 'PRAGMA database_list')).toHaveLength(1);
      expect(() => selectRows(db, "SELECT load_extension('outside')")).toThrow();
      expect(selectRows(db, 'SELECT * FROM lab_customers')).toHaveLength(102);
    } finally { db.close(); }
  });
});

describe('lab boundary and complete demo attack chains', () => {
  it('exposes only synthetic public backup/config and confines reflected XSS to a sandbox', async () => {
    const backup = await (await request('/backups/customers.json')).json() as { count: number; synthetic: boolean };
    expect(backup).toMatchObject({ count: 102, synthetic: true });
    const config = await (await request('/debug/config')).text();
    expect(config).toContain('DEMO-INVALID-KEY');
    expect(config).not.toContain(env.ATTACK_LAB_SESSION_SECRET);
    const payload = '<script>document.body.dataset.executed="yes"</script>';
    const reflection = await request(`/reflection?q=${encodeURIComponent(payload)}`);
    expect(await reflection.text()).toContain(payload);
    const csp = reflection.headers.get('content-security-policy')!;
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("connect-src 'none'");
  });
  it('requires all lab flags, a separate signing key and the exact deployment hostname', async () => {
    expect(attackLabConfigured(env, 'democommerce-lab.democommerce.workers.dev')).toBe(true);
    for (const overrides of [{ ATTACK_LAB_ENABLED: 'false' }, { LAB_SYNTHETIC_ONLY: 'false' }, { APP_ENV: 'production' }, { ATTACK_LAB_SESSION_SECRET: '' }]) {
      expect((await request('/status', '', undefined, { ...env, ...overrides })).status).toBe(404);
    }
    expect(attackLabConfigured(env, 'another.workers.dev')).toBe(false);
    expect((await request('/customers/1')).status).toBe(401);
  });
  it('uses SQLi to sign in, then demonstrates 102 synthetic customer extraction and its fixed control', async () => {
    expect((await login('buyer-a@example.test', 'wrong')).response.status).toBe(401);
    const bypass = await login("' OR 1=1 --", 'unknown');
    expect(bypass.response.status).toBe(200);
    expect((await bypass.response.json() as { marker: string }).marker).toBe('DEMO_SQL_LOGIN_SUCCESS');
    expect((await login("' OR 1=1 --", 'unknown', 'fixed')).response.status).toBe(401);
    const stolen = await request('/admin/export?role=admin&mode=vulnerable', bypass.cookie);
    expect(stolen.status).toBe(200);
    const data = await stolen.json() as { count: number; customers: { synthetic: number; email: string }[] };
    expect(data.count).toBe(102);
    expect(data.customers.every((row: { synthetic: number; email: string }) => row.synthetic === 1 && row.email.endsWith('@example.test'))).toBe(true);
    expect((await request('/admin/export?role=admin&mode=fixed', bypass.cookie)).status).toBe(403);
  });
  it('isolates IDOR, over-sharing, and virtual traversal with independent fixed controls', async () => {
    const { cookie } = await login();
    expect((await request('/customers/1?mode=vulnerable', cookie)).status).toBe(200);
    expect((await request('/customers/1?mode=fixed', cookie)).status).toBe(404);
    expect((await request('/customers/2?mode=fixed', cookie)).status).toBe(200);
    const profile = await (await request('/profile', cookie)).json() as { customer: { internal_note: string } };
    expect(profile.customer.internal_note).toContain('DEMO ONLY');
    const fixed = await (await request('/profile?mode=fixed', cookie)).json() as { customer: object };
    expect(Object.keys(fixed.customer).sort()).toEqual(['full_name', 'id']);
    expect((await (await request('/download?file=..%2Fbackups%2Fcustomers.json', cookie)).json() as { count: number }).count).toBe(102);
    expect((await request('/download?file=..%2Fbackups%2Fcustomers.json&mode=fixed', cookie)).status).toBe(403);
    expect((await request('/download?file=summary.json&mode=fixed', cookie)).status).toBe(200);
    expect((await request('/download?file=..%2F..%2Fetc%2Fpasswd', cookie)).status).toBe(404);
  });
  it('shows weak demo credentials, rejects tampered sessions, and clears sessions on logout', async () => {
    expect((await login('admin@example.test', 'admin')).response.status).toBe(200);
    expect((await login('admin@example.test', 'admin', 'fixed')).response.status).toBe(401);
    const { cookie } = await login();
    expect((await request('/me', cookie)).status).toBe(200);
    expect((await request('/me', `${cookie}tampered`)).status).toBe(401);
    const logout = await request('/logout', cookie, {});
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await request('/me')).status).toBe(401);
  });
  it('bounds inputs and rejects cross-origin submissions and non-lab schema access', async () => {
    expect((await request('/login', '', { email: 'a'.repeat(5000), password: 'x', mode: 'vulnerable' })).status).toBe(413);
    const csrf = await attackLab.request(`${origin}/login`, { method: 'POST', headers: { Origin: 'https://other.test' }, body: '{}' }, env);
    expect(csrf.status).toBe(403);
    const { cookie } = await login();
    const path = `/search?q=${encodeURIComponent("' UNION SELECT 1,2,secret FROM demo_customers --")}`;
    expect((await request(path, cookie)).status).toBe(400);
  });
});
