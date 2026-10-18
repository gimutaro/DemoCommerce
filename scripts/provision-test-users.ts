import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { buyerFixtures, TEST_BUYERS, validateFixtureTarget } from '../src/shared/fixtures'
import { PRODUCTS } from '../src/shared/products'
import { customerFixture } from '../src/shared/customers'

const root = fileURLToPath(new URL('../', import.meta.url))
const credentialsPath = resolve(root, '.fixtures/test-users.env')
const fixtureMarker = 'democommerce-m1'

function loadFile(path: string): void {
  if (!existsSync(path)) return
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    throw new Error('Fixture configuration must use regular files, not symlinks.')
  }
  for (const [name, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (process.env[name] === undefined || process.env[name] === '') process.env[name] = value
  }
}

export function loadFixtureEnvironment(): void {
  for (const name of ['.env', '.env.local', '.dev.vars', '.fixtures/test-users.env']) {
    loadFile(resolve(root, name))
  }
}

export function fixtureAdmin(): SupabaseClient {
  loadFixtureEnvironment()
  // Validate the destination before reading a secret or making an HTTP request.
  const url = validateFixtureTarget(process.env)
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is required; use the local or dedicated synthetic project server key.')
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

function fixturePasswords(): Record<'A' | 'B', string> {
  const passwords = {} as Record<'A' | 'B', string>
  let generated = false
  for (const buyer of TEST_BUYERS) {
    const name = `TEST_BUYER_${buyer.key}_PASSWORD`
    let password = process.env[name] || process.env[`TEST_USER_${buyer.key}_PASSWORD`]
    if (!password) {
      password = `aA1!${randomBytes(32).toString('base64url')}`
      generated = true
    }
    if (password.length < 12) throw new Error(`${name} must contain at least 12 characters.`)
    passwords[buyer.key] = password
  }
  if (generated) {
    // Never persist credentials outside the checkout's existing ignored location.
    try { execFileSync('git', ['check-ignore', '--quiet', '--', '.fixtures/test-users.env'], { cwd: root, stdio: 'ignore' }) }
    catch { throw new Error('Ignore .fixtures/ in Git before generating local credentials.') }
    const directory = resolve(root, '.fixtures')
    if (existsSync(directory) && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) {
      throw new Error('.fixtures must be a regular local directory.')
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (existsSync(credentialsPath)) {
      throw new Error('An existing credential file is incomplete. Supply the missing TEST_BUYER_*_PASSWORD environment variable without overwriting it.')
    }
    writeFileSync(credentialsPath,
      `# Local synthetic accounts. Never commit or print this file.\nTEST_BUYER_A_PASSWORD=${passwords.A}\nTEST_BUYER_B_PASSWORD=${passwords.B}\n`,
      { flag: 'wx', mode: 0o600 })
    console.info('Generated credentials saved in ignored .fixtures/test-users.env (mode 0600). Values are not printed.')
  }
  return passwords
}

export async function existingFixtureUsers(admin: SupabaseClient): Promise<Map<string, User>> {
  const users = new Map<string, User>()
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Could not read test account registry; verify the project server key.')
    for (const user of data.users) {
      if (TEST_BUYERS.some((buyer) => buyer.email === user.email)) {
        if (user.app_metadata.democommerce_fixture !== fixtureMarker) {
          throw new Error('A reserved test email already exists without the synthetic fixture marker. Refusing to modify that account.')
        }
        users.set(user.email!, user)
      }
    }
    if (data.users.length < 100) return users
  }
  throw new Error('Account registry exceeds the fixture safety limit; use a dedicated synthetic project.')
}

export async function writeBuyerFixtures(admin: SupabaseClient, buyer: 'A' | 'B', userId: string, reset: boolean): Promise<void> {
  const fixture = buyerFixtures(buyer, userId)
  const ids = fixture.orders.map((order) => order.id)
  const { data: existing, error: readError } = await admin.from('orders')
    .select('id,user_id,order_code').in('id', ids)
  if (readError) throw new Error('Could not verify fixture order ownership. Apply the M1 migration first.')
  for (const order of existing ?? []) {
    const expected = fixture.orders.find((item) => item.id === order.id)
    if (order.user_id !== userId || order.order_code !== expected?.order_code) {
      throw new Error('A fixture order ID is occupied by unexpected data. No reset was performed.')
    }
  }
  const { data: existingItems, error: itemReadError } = await admin.from('order_items')
    .select('id,order_id').in('id', fixture.items.map((item) => item.id))
  if (itemReadError) throw new Error('Could not verify fixture item ownership. No reset was performed.')
  for (const item of existingItems ?? []) {
    if (item.order_id !== fixture.items.find((expected) => expected.id === item.id)?.order_id) {
      throw new Error('A fixture item ID is occupied by unexpected data. No reset was performed.')
    }
  }
  if (reset && existing?.length) {
    const { error } = await admin.from('orders').delete().in('id', ids).eq('user_id', userId)
    if (error) throw new Error('Could not remove the known synthetic fixture orders.')
  }
  const profile = TEST_BUYERS.find((entry) => entry.key === buyer)!
  const { error: profileError } = await admin.from('profiles').upsert({ id: userId, display_name: profile.displayName }, { onConflict: 'id' })
  if (profileError) throw new Error('Could not save the synthetic test profile.')
  const { error: orderError } = await admin.from('orders').upsert(fixture.orders, { onConflict: 'id' })
  if (orderError) throw new Error('Could not save the synthetic fixture orders.')
  const { error: itemError } = await admin.from('order_items').upsert(fixture.items, { onConflict: 'id' })
  if (itemError) throw new Error('Could not save the synthetic fixture order items.')
}

export async function provisionTestUsers(): Promise<void> {
  const admin = fixtureAdmin()
  const passwords = fixturePasswords()
  const existing = await existingFixtureUsers(admin)
  const { error: productError } = await admin.from('products').upsert([...PRODUCTS], { onConflict: 'id' })
  if (productError) throw new Error('Could not save the public synthetic catalog. Apply the M1 migration first.')
  for (const buyer of TEST_BUYERS) {
    const known = existing.get(buyer.email)
    const attributes = {
      password: passwords[buyer.key], email_confirm: true,
      app_metadata: { democommerce_fixture: fixtureMarker },
      user_metadata: { display_name: buyer.displayName },
    }
    const { data, error } = known
      ? await admin.auth.admin.updateUserById(known.id, attributes)
      : await admin.auth.admin.createUser({ email: buyer.email, ...attributes })
    if (error || !data.user) throw new Error(`Could not provision synthetic account ${buyer.key}. No credentials were printed.`)
    await writeBuyerFixtures(admin, buyer.key, data.user.id, false)
    const { error: customerError } = await admin.from('demo_customers').upsert(customerFixture(buyer.key, data.user.id), { onConflict: 'user_id' })
    if (customerError) throw new Error('Could not save synthetic customers. Apply the customer migration first.')
  }
  console.info('Provisioned 2 synthetic accounts and 4 stable fixture orders. No emails, payments or deliveries are sent.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  provisionTestUsers().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Fixture provisioning failed.')
    process.exitCode = 1
  })
}
