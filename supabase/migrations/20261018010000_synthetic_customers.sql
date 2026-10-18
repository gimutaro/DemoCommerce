-- Dedicated synthetic identity records. Never import real customer data here.
create table public.demo_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  birth_date date not null,
  postal_code text not null check (postal_code = '000-0000'),
  address text not null check (address like '架空県%'),
  phone text not null check (phone like '000-%'),
  email text not null check (email in ('buyer-a@example.test', 'buyer-b@example.test')),
  license_number text not null check (license_number like 'DEMO-INVALID-%'),
  license_svg text not null,
  employer text not null,
  synthetic boolean not null default true check (synthetic = true)
);
alter table public.demo_customers enable row level security;
revoke all on public.demo_customers from anon, authenticated;
grant select on public.demo_customers to authenticated;
grant select, insert, update, delete on public.demo_customers to service_role;
create policy demo_customer_owner on public.demo_customers for select to authenticated using ((select auth.uid()) = user_id);
