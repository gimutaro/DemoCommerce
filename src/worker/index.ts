import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { PRODUCTS } from '../shared/products';
import { dataMode, supabaseConfig, type Bindings } from './config';
import { labConfigured, localDemoConfigured, publicDemoConfigured, verifyAccess } from './lab';
import { orders } from './orders';
import { attackLab, attackLabConfigured } from './attack-lab';

const app = new Hono<{ Bindings: Bindings }>();
const productFields = 'id,slug,name,description,price_jpy,category,image_path,is_active,stock';
const failure = (code: string, message: string) => ({ error: { code, message } });

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  const xssLab = c.req.path === '/api/attack-lab/reflection';
  c.header('X-Frame-Options', xssLab ? 'SAMEORIGIN' : 'DENY');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const supabaseOrigin = supabaseConfig(c.env)?.url ?? '';
  const dev = c.env.APP_ENV === 'local';
  c.header('Content-Security-Policy', xssLab ? "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'" : [
    "default-src 'self'",
    `script-src 'self'${dev ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin}${dev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '));
  if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store');
});

// Protect the entire lab Worker, including SPA assets and alternate hostnames.
app.use('*', async (c, next) => {
  if (c.env.LOCAL_DEMO_ENABLED === 'true') {
    const host = new URL(c.req.url).hostname;
    if (!localDemoConfigured(c.env) || !['127.0.0.1', 'localhost'].includes(host)) return c.text('Not found', 404);
    c.header('Cache-Control', 'no-store');
  }
  if (c.env.APP_ENV === 'lab' || c.env.LAB_ENABLED === 'true') {
    if (!labConfigured(c.env)) return c.text('Not found', 404);
    if (!publicDemoConfigured(c.env) && !await verifyAccess(c.req.header('Cf-Access-Jwt-Assertion'), c.env)) return c.text('Forbidden', 403);
    c.header('Cache-Control', 'no-store');
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, environment: c.env.APP_ENV ?? 'unconfigured', dataMode: dataMode(c.env) }));

app.get('/api/config', (c) => {
  const mode = dataMode(c.env);
  const config = mode === 'supabase' ? supabaseConfig(c.env) : null;
  const lab = attackLabConfigured(c.env, new URL(c.req.url).hostname) ? { attackLabEnabled: true } : {};
  return c.json(config
    ? { mode, supabaseUrl: config.url, supabasePublishableKey: config.publishableKey, ...lab }
    : { mode, ...lab });
});

app.get('/api/products', async (c) => {
  const mode = dataMode(c.env);
  if (mode === 'mock') return c.json({ items: PRODUCTS.filter((p) => p.is_active) });
  const config = mode === 'supabase' ? supabaseConfig(c.env) : null;
  if (!config) return c.json(failure('NOT_CONFIGURED', '商品データの接続が設定されていません。'), 503);
  const supabase = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from('products').select(productFields).eq('is_active', true).order('id').limit(100);
  if (error) return c.json(failure('CATALOG_UNAVAILABLE', '商品を取得できませんでした。時間をおいて再度お試しください。'), 503);
  return c.json({ items: data });
});

app.get('/api/products/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return c.json(failure('NOT_FOUND', '商品が見つかりません。'), 404);
  const mode = dataMode(c.env);
  if (mode === 'mock') {
    const item = PRODUCTS.find((p) => p.slug === slug && p.is_active);
    return item ? c.json({ item }) : c.json(failure('NOT_FOUND', '商品が見つかりません。'), 404);
  }
  const config = mode === 'supabase' ? supabaseConfig(c.env) : null;
  if (!config) return c.json(failure('NOT_CONFIGURED', '商品データの接続が設定されていません。'), 503);
  const supabase = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.from('products').select(productFields).eq('slug', slug).eq('is_active', true).maybeSingle();
  if (error) return c.json(failure('CATALOG_UNAVAILABLE', '商品を取得できませんでした。'), 503);
  return data ? c.json({ item: data }) : c.json(failure('NOT_FOUND', '商品が見つかりません。'), 404);
});

app.get('/api/me', async (c) => {
  const authorization = c.req.header('Authorization');
  const match = authorization?.match(/^Bearer ([^\s]{1,8192})$/);
  if (!match) return c.json(failure('UNAUTHENTICATED', 'ログインしてください。'), 401);
  const config = dataMode(c.env) === 'supabase' ? supabaseConfig(c.env) : null;
  if (!config) return c.json(failure('AUTH_UNAVAILABLE', 'ログインの接続が設定されていません。'), 503);
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
  // Verify the token with Auth, never trust a decoded JWT or a client-provided id.
  const { data: { user }, error } = await client.auth.getUser(match[1]);
  if (error || !user) return c.json(failure('UNAUTHENTICATED', 'ログインの有効期限が切れています。'), 401);
  const { data: profile, error: profileError } = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  if (profileError) return c.json(failure('PROFILE_UNAVAILABLE', 'プロフィールを取得できませんでした。'), 503);
  return c.json({ id: user.id, displayName: profile?.display_name ?? 'テストユーザー' });
});

app.route('/api/orders', orders);
app.route('/api/lab/orders', orders);
app.route('/api/attack-lab', attackLab);
app.all('/api/*', (c) => c.json(failure('NOT_FOUND', 'ページが見つかりません。'), 404));
app.all('/lab', (c) => c.text('Not found', 404));
app.all('/lab/*', (c) => (labConfigured(c.env) && /^\/lab\/orders\/[0-9a-f-]{36}$/.test(c.req.path))
  || (c.req.path === '/lab/workbench' && attackLabConfigured(c.env, new URL(c.req.url).hostname))
  ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404));

app.all('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const uiRoute = ['/', '/login', '/account', '/orders', '/contact', '/staff'].includes(c.req.path)
    || /^\/orders\/[0-9a-f-]{36}$/.test(c.req.path)
    || /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(c.req.path);
  if (!uiRoute && response.headers.get('Content-Type')?.includes('text/html')) {
    return new Response(response.body, { status: 404, headers: response.headers });
  }
  return response;
});

app.onError((_error, c) => c.json(failure('INTERNAL_ERROR', '処理を完了できませんでした。'), 500));

export default app;
