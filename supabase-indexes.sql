-- ========================================
-- Indexes شاملة لقاعدة البيانات
-- هدف: تسريع الاستعلامات لتحمل 5 سنين من البيانات
-- ========================================
-- طريقة التنفيذ: انسخ الكود ده في Supabase SQL Editor وشغله

-- ========================================
-- 1. فواتير (invoices) - أكثر جدول بيتم استعلامه
-- ========================================
-- بحث بالفرع والتاريخ (أكثر استعلام بيتعمل)
CREATE INDEX IF NOT EXISTS idx_invoices_branch_date ON invoices(branch_id, created_at DESC);
-- بحث بحالة الفاتورة
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
-- بحث بالعميل
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
-- بحث برقم الفاتورة
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
-- بحث بالتاريخ فقط
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC);

-- ========================================
-- 2. عناصر الفواتير (invoice_items)
-- ========================================
-- بحث بفاتورة معينة
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
-- بحث بمنتج معين (للتقارير)
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

-- ========================================
-- 3. مرتجعات (returns)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_returns_branch_date ON returns(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_number ON returns(return_number);

-- ========================================
-- 4. عناصر المرتجعات (return_items)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON return_items(product_id);

-- ========================================
-- 5. مدفوعات (payments)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_payments_branch_date ON payments(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_number ON payments(payment_number);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

-- ========================================
-- 6. مصروفات (expenses)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON expenses(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_number ON expenses(expense_number);

-- ========================================
-- 7. مخزون (inventory)
-- ========================================
-- UNIQUE index موجود بالفعل على (product_id, branch_id) من الـ schema
-- إضافة index للبحث بفرع معين
CREATE INDEX IF NOT EXISTS idx_inventory_branch ON inventory(branch_id);
-- البحث بمنتج معين عبر كل الفروع
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);

-- ========================================
-- 8. حركات المخزون (inventory_transactions)
-- ========================================
-- أهم جدول للمخزون - حركة بالمنتج والفرع
CREATE INDEX IF NOT EXISTS idx_inv_trans_product_branch ON inventory_transactions(product_id, branch_id);
-- حركات بالتاريخ
CREATE INDEX IF NOT EXISTS idx_inv_trans_date ON inventory_transactions(created_at DESC);
-- حركات بنوع الحركة
CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(transaction_type);
-- حركات بمرجع (فاتورة، تحويل، إلخ)
CREATE INDEX IF NOT EXISTS idx_inv_trans_reference ON inventory_transactions(reference_type, reference_id);

-- ========================================
-- 9. قيود محاسبية (journal_entries)
-- ========================================
-- قيود بالتاريخ
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC);
-- قيود بالحالة
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted ON journal_entries(is_posted);
-- قيود برقم القيد
CREATE INDEX IF NOT EXISTS idx_journal_entries_number ON journal_entries(entry_number);
-- (source_type, source_id) موجود من Phase 3

-- ========================================
-- 10. أسطر القيود (journal_entry_lines)
-- ========================================
-- أسطر بقيد معين
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_entry_lines(journal_entry_id);
-- أسطر بحساب معين (للتقارير المحاسبية)
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_entry_lines(account_id);

-- ========================================
-- 11. عملاء (customers)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);

-- ========================================
-- 12. منتجات (products)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- ========================================
-- 13. فروع (branches)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active);

-- ========================================
-- 14. مستخدمين (users)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);

-- ========================================
-- 15. سجل النشاط (audit_log)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_audit_log_date ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ========================================
-- 16. تصبين وتحويلات (inventory_transfers) - تكميلي
-- ========================================
-- من Phase 3 موجود: from_branch_id, to_branch_id, status, transfer_date
-- إضافة composite index للبحث الشائع
CREATE INDEX IF NOT EXISTS idx_transfers_branches_date ON inventory_transfers(from_branch_id, to_branch_id, transfer_date DESC);

-- ========================================
-- 17. عناصر التحويلات (inventory_transfer_items)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON inventory_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_product ON inventory_transfer_items(product_id);

-- ========================================
-- 18. جرد المخزون (inventory_counts) - تكميلي
-- ========================================
-- من Phase 3 موجود: branch_id, status
CREATE INDEX IF NOT EXISTS idx_counts_date ON inventory_counts(count_date DESC);

-- ========================================
-- 19. عناصر الجرد (inventory_count_items)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_count_items_count ON inventory_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_count_items_product ON inventory_count_items(product_id);

-- ========================================
-- 20. شجرة الحسابات (chart_of_accounts) - تكميلي
-- ========================================
-- من Phase 3 موجود: account_type, parent_id
CREATE INDEX IF NOT EXISTS idx_coa_code ON chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_coa_active ON chart_of_accounts(is_active);

-- ========================================
-- 21. طرق الدفع (payment_methods)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_payment_methods_sort ON payment_methods(sort_order);

-- ========================================
-- 22. تصنيفات المصروفات (expense_categories)
-- ========================================
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(is_active);
