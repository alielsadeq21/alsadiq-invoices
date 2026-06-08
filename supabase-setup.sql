-- =====================================================
-- SQL Script: Create payment_methods table + Fix payments RLS
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- 1. Create payment_methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Enable RLS with permissive policy (same pattern as other tables)
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on payment_methods" ON public.payment_methods
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Seed default payment methods
INSERT INTO public.payment_methods (name, is_default, sort_order) VALUES
  ('نقداً', true, 1),
  ('تحويل بنكي', false, 2),
  ('شيك', false, 3)
ON CONFLICT DO NOTHING;

-- 4. Fix RLS on payments table (if not already done)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Allow all operations on payments'
  ) THEN
    CREATE POLICY "Allow all operations on payments" ON public.payments
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verify: SELECT * FROM public.payment_methods;
