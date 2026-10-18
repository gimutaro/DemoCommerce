-- Allow only explicitly fictional batch emails; retain ownership RLS and all other checks.
ALTER TABLE public.demo_customers DROP CONSTRAINT demo_customers_email_check;
ALTER TABLE public.demo_customers ADD CONSTRAINT demo_customers_email_check CHECK (
  email in ('buyer-a@example.test', 'buyer-b@example.test')
  OR email ~ '^customer-[0-9]{3}@example\.test$'
);
