import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { buyerFixtures } from '../shared/fixtures';
import { dataMode, supabaseConfig, type Bindings } from './config';
import { labConfigured } from './lab';

export const orders = new Hono<{ Bindings: Bindings }>();
const fields = 'id,user_id,order_code,status,total_jpy,created_at';
const fail = (code: string, message: string) => ({ error: { code, message } });
orders.get('*', async (c) => {
  const lab = c.req.path.startsWith('/api/lab/');
  if (lab && !labConfigured(c.env)) return c.json(fail('NOT_FOUND', '見つかりません。'), 404);
  const token = c.req.header('Authorization')?.match(/^Bearer ([^\s]{1,8192})$/)?.[1];
  if (!token) return c.json(fail('UNAUTHENTICATED', 'ログインしてください。'), 401);
  const config = dataMode(c.env) === 'supabase' ? supabaseConfig(c.env) : null;
  if (!config) return c.json(fail('NOT_CONFIGURED', 'Supabase接続を設定してください。'), 503);
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return c.json(fail('UNAUTHENTICATED', 'ログインしてください。'), 401);
  if (lab && (!['buyer-a@example.test', 'buyer-b@example.test'].includes(user.email ?? '')
    || user.app_metadata?.democommerce_fixture !== 'democommerce-m1')) {
    return c.json(fail('FORBIDDEN', 'テストアカウント専用です。'), 403);
  }
  const id = c.req.path.split('/')[lab ? 4 : 3];
  if (!id && !lab) {
    const result = await client.from('orders').select(fields).eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
    return result.error ? c.json(fail('UNAVAILABLE', '注文を取得できません。'), 503) : c.json({ items: result.data });
  }
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return c.json(fail('NOT_FOUND', '注文が見つかりません。'), 404);
  let reader = client;
  let fixture: ReturnType<typeof buyerFixtures>['orders'][number] | undefined;
  if (lab) {
    fixture = [...buyerFixtures('A', '' ).orders, ...buyerFixtures('B', '').orders].find((order) => order.id === id);
    if (!fixture) return c.json(fail('NOT_FOUND', '注文が見つかりません。'), 404);
    reader = createClient(config.url, c.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  let query = reader.from('orders').select(fields).eq('id', id);
  // Deliberate LAB-IDOR-001: only the isolated lab omits the requesting owner's filter.
  if (!lab) query = query.eq('user_id', user.id);
  else query = query.eq('order_code', fixture!.order_code);
  const result = await query.maybeSingle();
  if (result.error) return c.json(fail('UNAVAILABLE', '注文を取得できません。'), 503);
  if (!result.data) return c.json(fail('NOT_FOUND', '注文が見つかりません。'), 404);
  if (lab) {
    const owner = await reader.auth.admin.getUserById(result.data.user_id);
    const expected = fixture!.order_code.includes('_A_') ? 'buyer-a@example.test' : 'buyer-b@example.test';
    if (owner.error || owner.data.user?.email !== expected || owner.data.user.app_metadata?.democommerce_fixture !== 'democommerce-m1') return c.json(fail('NOT_FOUND', '注文が見つかりません。'), 404);
  }
  const details = await reader.from('order_items').select('id,product_id,quantity,unit_price_jpy').eq('order_id', id).limit(10);
  if (details.error) return c.json(fail('UNAVAILABLE', '明細を取得できません。'), 503);
  const customer = await reader.from('demo_customers').select('full_name,birth_date,postal_code,address,phone,email,license_number,license_svg,employer,synthetic').eq('user_id', result.data.user_id).eq('synthetic', true).maybeSingle();
  if (customer.error || !customer.data) return c.json(fail('UNAVAILABLE', '架空顧客データを準備してください。'), 503);
  return c.json({ item: result.data, items: details.data, customer: customer.data, synthetic: true, viewerIsOwner: result.data.user_id === user.id });
});
