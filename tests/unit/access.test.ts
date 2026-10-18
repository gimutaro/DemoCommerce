import { describe, it, expect, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { verifyAccess } from '../../src/worker/lab';
import type { Bindings } from '../../src/worker/config';
const state = vi.hoisted(() => ({ resolver: undefined as unknown }));
vi.mock('jose', async (original) => ({ ...await original<typeof import('jose')>(), createRemoteJWKSet: () => state.resolver }));
describe('Access signature and claims', () => {
  it('accepts valid RS256 and rejects expired, wrong audience, issuer and signature', async () => {
    const pair = await generateKeyPair('RS256');
    state.resolver = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test', alg: 'RS256' }] });
    const env = { APP_ENV: 'lab', LAB_ENABLED: 'true', DATA_MODE: 'supabase', LAB_SYNTHETIC_ONLY: 'true', SUPABASE_URL: 'https://test.supabase.co', LAB_SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'test-only', ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', ACCESS_AUD: 'correct' } as Bindings;
    const sign = (issuer = env.ACCESS_TEAM_DOMAIN!, audience = 'correct', expiry: string | number = '2m', key = pair.privateKey) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuedAt().setExpirationTime(expiry).setIssuer(issuer).setAudience(audience).sign(key);
    expect(await verifyAccess(await sign(), env)).toBe(true);
    expect(await verifyAccess(await sign('https://wrong.cloudflareaccess.com'), env)).toBe(false);
    expect(await verifyAccess(await sign(undefined, 'wrong'), env)).toBe(false);
    expect(await verifyAccess(await sign(undefined, undefined, 1), env)).toBe(false);
    const other = await generateKeyPair('RS256');
    expect(await verifyAccess(await sign(undefined, undefined, '2m', other.privateKey), env)).toBe(false);
    expect(await verifyAccess('fake.header.signature', env)).toBe(false);
  });
});
