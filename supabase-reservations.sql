-- ============================================================
-- قسم المناسبات والحجوزات - reservations
-- مصنع الصادق - نظام فواتير الصرف
-- ============================================================
-- ⚠️ يرجى تنفيذ هذا السكربت في Supabase SQL Editor
-- ============================================================

-- 1. إنشاء جدول الحجوزات
CREATE TABLE IF NOT EXISTS reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  branch_id UUID REFERENCES branches(id),
  event_type TEXT NOT NULL DEFAULT 'other',
  event_date DATE NOT NULL,
  event_time TIME,
  notes TEXT,
  items JSONB DEFAULT '[]',
  total_amount NUMERIC(12,2) DEFAULT 0,
  advance_payment NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  cancel_reason TEXT,
  reminder_1_sent BOOLEAN DEFAULT false,
  reminder_2_sent BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. إنشاء فهارس
CREATE INDEX IF NOT EXISTS idx_reservations_event_date ON reservations(event_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_branch_id ON reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);

-- 3. تفعيل RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 4. إنشاء سياسات الأمان
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reservations' AND policyname = 'reservations_read_all') THEN
    CREATE POLICY "reservations_read_all" ON reservations FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reservations' AND policyname = 'reservations_insert_all') THEN
    CREATE POLICY "reservations_insert_all" ON reservations FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reservations' AND policyname = 'reservations_update_all') THEN
    CREATE POLICY "reservations_update_all" ON reservations FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reservations' AND policyname = 'reservations_delete_all') THEN
    CREATE POLICY "reservations_delete_all" ON reservations FOR DELETE USING (true);
  END IF;
END $$;

-- 5. إنشاء دالة توليد رقم الحجز
CREATE OR REPLACE FUNCTION generate_reservation_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(reservation_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM reservations
  WHERE reservation_number ~ '^RSV-\d+$';
  
  RETURN 'RSV-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 6. إنشاء trigger لتوليد رقم الحجز تلقائياً
CREATE OR REPLACE FUNCTION set_reservation_number_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reservation_number IS NULL OR NEW.reservation_number = '' THEN
    NEW.reservation_number := generate_reservation_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_reservation_number ON reservations;
CREATE TRIGGER set_reservation_number
  BEFORE INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION set_reservation_number_fn();

-- 7. تحديث صلاحيات الأدوار
UPDATE roles 
SET permissions = permissions || '{"reservations": {"view": true, "create": true, "edit": true, "delete": true, "print": true}}'::jsonb,
    updated_at = now()
WHERE name = 'admin';

UPDATE roles 
SET permissions = permissions || '{"reservations": {"view": true, "create": true, "edit": true, "print": true}}'::jsonb,
    updated_at = now()
WHERE name = 'branch_manager';

UPDATE roles 
SET permissions = permissions || '{"reservations": {"view": true, "create": true, "print": true}}'::jsonb,
    updated_at = now()
WHERE name = 'cashier';
