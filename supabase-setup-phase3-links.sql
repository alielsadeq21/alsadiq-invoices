-- ========================================
-- إضافات المرحلة الثالثة: أعمدة إضافية لربط القيود
-- ========================================

-- 1. إضافة عمود journal_entry_id لجدول المدفوعات
ALTER TABLE payments ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- 2. إضافة عمود journal_entry_id لجدول المرتجعات (لو مش موجود)
ALTER TABLE returns ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- 3. إضافة عمود journal_entry_id لجدول الفواتير (لو مش موجود)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_journal_entry_id ON payments(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_returns_journal_entry_id ON returns(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_invoices_journal_entry_id ON invoices(journal_entry_id);
