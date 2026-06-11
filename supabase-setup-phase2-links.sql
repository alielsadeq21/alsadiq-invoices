-- ============================================================
-- Phase 2 Links: ربط الأجزاء ببعضها
-- 1. إضافة customer_id لجدول الفواتير
-- ============================================================

-- 1. إضافة عمود customer_id لجدول الفواتير
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- إنشاء index لأداء البحث
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);

-- 2. إضافة أعمدة product_id لجدول عناصر الفاتورة (لربط المخزون)
ALTER TABLE invoice_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id);

-- 3. إضافة أعمدال product_id لجدول عناصر المرتجع
ALTER TABLE return_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON return_items(product_id);

-- 4. إضافة عمود journal_entry_id لجدول المصروفات (لربط القيود المحاسبية)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_journal_entry_id ON expenses(journal_entry_id);
