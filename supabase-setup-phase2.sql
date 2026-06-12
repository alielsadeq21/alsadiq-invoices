-- ==========================================
-- المرحلة الثانية: المخزون والمصروفات والمحاسبة والعملاء
-- مصنع الصادق - نظام فواتير الصرف
-- ==========================================
-- يُرجى تنفيذ هذا السكربت في Supabase SQL Editor
-- ==========================================

-- 1. جدول العملاء
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  tax_number TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول تصنيفات المصروفات
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول المصروفات
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_number TEXT NOT NULL UNIQUE,
  branch_id UUID REFERENCES branches(id),
  category_id UUID REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول المخزون
CREATE TABLE IF NOT EXISTS inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  branch_id UUID REFERENCES branches(id),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, branch_id)
);

-- 5. جدول حركات المخزون
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  branch_id UUID REFERENCES branches(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('in', 'out', 'adjust', 'transfer')),
  quantity NUMERIC(12,2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. جدول القيود المحاسبية
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_number TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  total_debit NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_posted BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. جدول بنود القيود المحاسبية
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  debit NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. إدراج تصنيفات المصروفات الافتراضية
INSERT INTO expense_categories (name, description) VALUES
  ('إيجارات', 'إيجارات المحلات والمكاتب'),
  ('مرتبات', 'مرتبات الموظفين والعمال'),
  ('كهرباء ومياه', 'فواتير الكهرباء والمياه والغاز'),
  ('صيانة', 'صيانة المعدات والأجهزة'),
  ('نقل وشحن', 'مصاريف النقل والشحن والتوصيل'),
  ('مصاريف إدارية', 'مصاريف إدارية وقرطاسية'),
  ('مصاريف تسويق', 'إعلانات وتسويق وترويج'),
  ('مصاريف أخرى', 'مصاريف متنوعة أخرى')
ON CONFLICT (name) DO NOTHING;

-- 9. تفعيل RLS

-- العملاء
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on customers" ON customers
  FOR ALL USING (true) WITH CHECK (true);

-- تصنيفات المصروفات
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on expense_categories" ON expense_categories
  FOR ALL USING (true) WITH CHECK (true);

-- المصروفات
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on expenses" ON expenses
  FOR ALL USING (true) WITH CHECK (true);

-- المخزون
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on inventory" ON inventory
  FOR ALL USING (true) WITH CHECK (true);

-- حركات المخزون
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on inventory_transactions" ON inventory_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- القيود المحاسبية
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on journal_entries" ON journal_entries
  FOR ALL USING (true) WITH CHECK (true);

-- بنود القيود المحاسبية
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on journal_entry_lines" ON journal_entry_lines
  FOR ALL USING (true) WITH CHECK (true);

-- ✅ تم بنجاح!
