import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadFixtureEnvironment } from './provision-test-users'
import { buyerFixtures, TEST_BUYERS, validateFixtureTarget } from '../src/shared/fixtures'

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

async function verifyFixtures(): Promise<void> {
  loadFixtureEnvironment()
  const url = validateFixtureTarget(process.env)
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY is required to verify client-side RLS.')
  const users: { api: SupabaseClient; id: string; buyer: 'A' | 'B' }[] = []
  const anonymous = client(url, key)
  const { error: signupError } = await anonymous.auth.signUp({
    email: 'signup-disabled@example.test', password: `aA1!${randomBytes(32).toString('base64url')}`,
  })
  assert.equal(signupError?.code, 'signup_disabled', 'Public signups must remain disabled while email/password login is enabled.')
  const { data: products, error: productError } = await anonymous.from('products').select('id').eq('is_active', true)
  assert.equal(productError, null, 'Anonymous catalog lookup failed.')
  assert.equal(products?.length, 10, 'Anonymous catalog must contain ten active synthetic products.')
  for (const table of ['profiles', 'orders', 'order_items']) {
    const { error } = await anonymous.from(table).select('id').limit(1)
    assert.ok(error, `Anonymous ${table} access must be denied.`)
    assert.equal(error.code, '42501', `Anonymous ${table} access must fail with insufficient privilege.`)
  }
  for (const buyer of TEST_BUYERS) {
    const api = client(url, key)
    const password = process.env[`TEST_BUYER_${buyer.key}_PASSWORD`] || process.env[`TEST_USER_${buyer.key}_PASSWORD`]
    if (!password) throw new Error(`TEST_BUYER_${buyer.key}_PASSWORD is required; provision synthetic fixtures first.`)
    const { data, error } = await api.auth.signInWithPassword({ email: buyer.email, password })
    if (error || !data.user) throw new Error(`Synthetic buyer ${buyer.key} sign-in failed. Credentials were not printed.`)
    users.push({ api, id: data.user.id, buyer: buyer.key })
  }
  for (const own of users) {
    const other = users.find((entry) => entry.buyer !== own.buyer)!
    const expected = buyerFixtures(own.buyer, own.id)
    const foreign = buyerFixtures(other.buyer, other.id)
    const { data: orders, error: orderError } = await own.api.from('orders').select('id,user_id,order_code,total_jpy')
    assert.equal(orderError, null, `Buyer ${own.buyer} order lookup failed.`)
    assert.deepEqual(orders?.map((order) => order.id).sort(), expected.orders.map((order) => order.id).sort(), `Buyer ${own.buyer} must see exactly their two fixture orders.`)
    assert.ok(orders?.every((order) => order.user_id === own.id), 'Orders must belong to the authenticated principal.')
    const { data: items, error: itemError } = await own.api.from('order_items').select('id,order_id')
    assert.equal(itemError, null, `Buyer ${own.buyer} item lookup failed.`)
    assert.deepEqual(items?.map((item) => item.id).sort(), expected.items.map((item) => item.id).sort(), `Buyer ${own.buyer} must see exactly their four fixture order items.`)
    const { data: profiles, error: profileError } = await own.api.from('profiles').select('id')
    assert.equal(profileError, null, 'Own profile lookup failed.')
    assert.deepEqual(profiles, [{ id: own.id }], 'Only the authenticated profile may be returned.')
    const { data: customers, error: customerError } = await own.api.from('demo_customers').select('user_id,license_svg,synthetic')
    assert.equal(customerError, null, 'Customer lookup failed.')
    assert.equal(customers?.length, 1, 'Exactly one own customer record must be visible.')
    assert.equal(customers?.[0]?.user_id, own.id, 'Customer must belong to the authenticated principal.')
    assert.ok(customers?.[0]?.license_svg.includes('SAMPLE / 架空・無効'), 'Customer image must be a fictional sample.')
    const foreignCustomer = await own.api.from('demo_customers').select('user_id').eq('user_id', other.id)
    assert.equal(foreignCustomer.error, null, 'Customer RLS query failed.')
    assert.deepEqual(foreignCustomer.data, [], 'Other customer identity and image must not be readable.')
    for (const [table, column, value] of [
      ['profiles', 'id', other.id],
      ['orders', 'id', foreign.orders[0]!.id],
      ['order_items', 'order_id', foreign.orders[0]!.id],
    ]) {
      const { data, error } = await own.api.from(table!).select('id').eq(column!, value!)
      assert.equal(error, null, 'Cross-owner SELECT should be filtered by RLS.')
      assert.deepEqual(data, [], `Buyer ${own.buyer} must not retrieve the other buyer's ${table}.`)
    }
    // No data changes can occur: M1 deliberately grants no client order writes.
    const { error: writeError } = await own.api.from('orders').update({ user_id: other.id }).eq('id', expected.orders[0]!.id)
    assert.equal(writeError?.code, '42501', 'Direct order ownership mutation must be denied by GRANT.')
    await own.api.auth.signOut({ scope: 'local' })
  }
  console.info('Verified live Auth and REST RLS: 10 public products, A/B own profiles/orders/items, cross-owner isolation, denied anonymous access and denied order writes.')
}

verifyFixtures().catch((error: unknown) => {
  // Assertion explanations are fixed text; never render SDK response objects or sessions.
  console.error(error instanceof assert.AssertionError ? error.message.split('\n')[0] : error instanceof Error ? error.message : 'Fixture verification failed.')
  process.exitCode = 1
})
