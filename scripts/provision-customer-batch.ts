import { randomBytes } from 'node:crypto'
import { fixtureAdmin } from './provision-test-users'
import { customerFixture } from '../src/shared/customers'

const admin = fixtureAdmin()
if (process.env.SUPABASE_URL !== 'https://dmagegescrocnfwffxog.supabase.co') throw new Error('Dedicated demo project required')
const marker = 'democommerce-customers-100-v1'
const { count: before, error: countError } = await admin.from('demo_customers').select('*', { count: 'exact', head: true })
if (countError) throw countError
console.info(`Customers before: ${before}`)
const { data: registry, error: registryError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (registryError) throw registryError
const rows = []
for (let i = 1; i <= 100; i++) {
  const suffix = String(i).padStart(3, '0')
  const email = `customer-${suffix}@example.test`
  let user = registry.users.find((entry) => entry.email === email)
  if (user && user.app_metadata.democommerce_fixture !== marker) throw new Error('Existing unmarked account; refusing to modify')
  if (!user) {
    const result = await admin.auth.admin.createUser({ email, password: `aA1!${randomBytes(32).toString('base64url')}`, email_confirm: true, ban_duration: '876000h', app_metadata: { democommerce_fixture: marker } })
    if (result.error || !result.data.user) throw new Error(`Customer ${suffix} creation failed: ${result.error?.message}`)
    user = result.data.user
  }
  const name = `架空 ${['花子', '太郎', '美咲', '健太', '葵'][ (i-1) % 5 ]}${suffix}`
  const base = customerFixture('A', user.id)
  rows.push({ ...base, full_name: name, email,
    birth_date: `${1965 + (i % 40)}-${String(1 + (i % 12)).padStart(2,'0')}-${String(1 + (i % 28)).padStart(2,'0')}`,
    address: `架空県サンプル${1 + (i % 10)}市デモ町${1 + (i % 5)}-${i}-1 見本ハイツ${100+i}`,
    phone: `000-0000-${String(100+i).padStart(4,'0')}`,
    employer: `架空サンプル${1 + (i % 8)}株式会社`, license_number: `DEMO-INVALID-${suffix}`,
    license_svg: base.license_svg.replaceAll('架空 花子', name).replaceAll('DEMO-INVALID-A', `DEMO-INVALID-${suffix}`) })
  if (i % 20 === 0) console.info(`Prepared ${i}/100`)
}
const { error } = await admin.from('demo_customers').upsert(rows, { onConflict: 'user_id' })
if (error) throw error
const { data, error: verifyError, count } = await admin.from('demo_customers').select('email,synthetic,license_svg', { count: 'exact' })
if (verifyError) throw verifyError
const batch = data.filter((row) => /^customer-\d{3}@example\.test$/.test(row.email))
if (batch.length !== 100 || batch.some((row) => !row.synthetic || !row.license_svg.includes('SAMPLE / 架空・無効'))) throw new Error('Batch verification failed')
console.info(JSON.stringify({ customersBefore: before, customersAfter: count, batchCustomers: batch.length, sampleImages: batch.length }))
