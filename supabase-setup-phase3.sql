-- ========================================
-- المرحلة الثالثة: نظام المخزون المتقدم + المحاسبة التلقائية + التقارير
-- ========================================

-- 1. إضافة عمود is_factory لجدول الفروع (لتحديد المصنع الرئيسي)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_factory boolean DEFAULT false;

-- تحديد أول فرع كمصنع إذا لم يكن موجود
UPDATE branches SET is_factory = true WHERE id = (
  SELECT id FROM branches WHERE is_active = true ORDER BY created_at ASC LIMIT 1
);

-- 2. جدول شجرة الحسابات
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  name_en VARCHAR(200),
  parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول تصبين المخزون (تحويل من المصنع للفرع)
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_number VARCHAR(50) NOT NULL UNIQUE,
  from_branch_id UUID NOT NULL REFERENCES branches(id),
  to_branch_id UUID NOT NULL REFERENCES branches(id),
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount DECIMAL(15,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول عناصر التصبين
CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. جدول جرد المخزون
CREATE TABLE IF NOT EXISTS inventory_counts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  count_number VARCHAR(50) NOT NULL UNIQUE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. جدول عناصر الجرد
CREATE TABLE IF NOT EXISTS inventory_count_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  system_quantity INTEGER NOT NULL DEFAULT 0,
  actual_quantity INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. إضافة أنواع جديدة لحركات المخزون
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type IN ('in', 'out', 'adjust', 'transfer', 'tasbeen', 'sale', 'return', 'count'));

-- 8. إضافة عمود transfer_id لحركات المخزون
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES inventory_transfers(id);

-- 9. إضافة عمود account_id لأسطر القيود
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES chart_of_accounts(id);

-- 10. إضافة عمود source_type و source_id للقيود (للربط التلقائي)
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_type VARCHAR(50);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_id UUID;

-- ========================================
-- إدراج شجرة الحسابات الافتراضية
-- ========================================

INSERT INTO chart_of_accounts (code, name, name_en, account_type, is_system) VALUES
-- أصول
('1000', 'الأصول', 'Assets', 'asset', true),
('1100', 'أصول متداولة', 'Current Assets', 'asset', true),
('1101', 'الصندوق (كاش)', 'Cash', 'asset', true),
('1102', 'البنك', 'Bank', 'asset', true),
('1103', 'العملاء', 'Customers', 'asset', true),
('1104', 'مخزون المصنع', 'Factory Inventory', 'asset', true),
('1105', 'مخزون الفروع', 'Branch Inventory', 'asset', true),
('1200', 'أصول ثابتة', 'Fixed Assets', 'asset', true),
('1201', 'المعدات والأجهزة', 'Equipment', 'asset', true),
('1202', 'الأثاث والتجهيزات', 'Furniture & Fixtures', 'asset', true),

-- خصوم
('2000', 'الخصوم', 'Liabilities', 'liability', true),
('2100', 'دائنون', 'Payables', 'liability', true),
('2101', 'الموردين', 'Suppliers', 'liability', true),
('2102', 'حسابات الفروع', 'Branch Accounts', 'liability', true),
('2200', 'قروض', 'Loans', 'liability', true),

-- حقوق ملكية
('3000', 'حقوق الملكية', 'Equity', 'equity', true),
('3100', 'رأس المال', 'Capital', 'equity', true),
('3200', 'أرباح محتجزة', 'Retained Earnings', 'equity', true),

-- إيرادات
('4000', 'الإيرادات', 'Revenue', 'revenue', true),
('4100', 'المبيعات', 'Sales', 'revenue', true),
('4101', 'مبيعات الفروع', 'Branch Sales', 'revenue', true),
('4200', 'إيرادات أخرى', 'Other Revenue', 'revenue', true),
('4201', 'مبيعات مرتجعة', 'Sales Returns', 'revenue', true),

-- مصروفات
('5000', 'المصروفات', 'Expenses', 'expense', true),
('5100', 'تكلفة المبيعات', 'Cost of Sales', 'expense', true),
('5200', 'مصروفات تشغيلية', 'Operating Expenses', 'expense', true),
('5300', 'مصروفات إدارية', 'Administrative Expenses', 'expense', true),
('5400', 'الضريبة', 'Tax', 'expense', true)
ON CONFLICT (code) DO NOTHING;

-- تحديث العلاقات الأبوية
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1000') WHERE code IN ('1100', '1200');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1100') WHERE code IN ('1101', '1102', '1103', '1104', '1105');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '1200') WHERE code IN ('1201', '1202');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '2000') WHERE code IN ('2100', '2200');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '2100') WHERE code IN ('2101', '2102');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '3000') WHERE code IN ('3100', '3200');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4000') WHERE code IN ('4100', '4200');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4100') WHERE code IN ('4101');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '4200') WHERE code IN ('4201');
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM chart_of_accounts WHERE code = '5000') WHERE code IN ('5100', '5200', '5300', '5400');

-- ========================================
-- RLS Policies
-- ========================================

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;

-- chart_of_accounts: الجميع يقرأ، المدير يكتب
CREATE POLICY "Anyone can read chart_of_accounts" ON chart_of_accounts FOR SELECT USING (true);
CREATE POLICY "Admin can insert chart_of_accounts" ON chart_of_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update chart_of_accounts" ON chart_of_accounts FOR UPDATE USING (true);
CREATE POLICY "Admin can delete chart_of_accounts" ON chart_of_accounts FOR DELETE USING (is_system = false);

-- inventory_transfers: الجميع يقرأ، المستخدمين يضيفون
CREATE POLICY "Anyone can read inventory_transfers" ON inventory_transfers FOR SELECT USING (true);
CREATE POLICY "Users can insert inventory_transfers" ON inventory_transfers FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update inventory_transfers" ON inventory_transfers FOR UPDATE USING (true);

-- inventory_transfer_items: الجميع يقرأ
CREATE POLICY "Anyone can read inventory_transfer_items" ON inventory_transfer_items FOR SELECT USING (true);
CREATE POLICY "Users can insert inventory_transfer_items" ON inventory_transfer_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update inventory_transfer_items" ON inventory_transfer_items FOR UPDATE USING (true);
CREATE POLICY "Users can delete inventory_transfer_items" ON inventory_transfer_items FOR DELETE USING (true);

-- inventory_counts: الجميع يقرأ، المستخدمين يضيفون
CREATE POLICY "Anyone can read inventory_counts" ON inventory_counts FOR SELECT USING (true);
CREATE POLICY "Users can insert inventory_counts" ON inventory_counts FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update inventory_counts" ON inventory_counts FOR UPDATE USING (true);

-- inventory_count_items: الجميع يقرأ
CREATE POLICY "Anyone can read inventory_count_items" ON inventory_count_items FOR SELECT USING (true);
CREATE POLICY "Users can insert inventory_count_items" ON inventory_count_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update inventory_count_items" ON inventory_count_items FOR UPDATE USING (true);
CREATE POLICY "Users can delete inventory_count_items" ON inventory_count_items FOR DELETE USING (true);

-- ========================================
-- Indexes
-- ========================================

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from ON inventory_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to ON inventory_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_date ON inventory_transfers(transfer_date);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_branch ON inventory_counts(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_status ON inventory_counts(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_type, source_id);
