-- إصلاح جدول الأدوار + إضافة دور الكاشير + تحديث الصلاحيات
-- تاريخ: 2026-06-12

-- 1. إضافة عمود updated_at لجدول roles (لو مش موجود)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE roles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- 2. إضافة دور الكاشير (لو مش موجود)
INSERT INTO roles (name, display_name, description, permissions, is_system)
VALUES (
  'cashier',
  'كاشير',
  'نقطة البيع فقط - بيع ومرتجعات وإضافة عملاء',
  '{
    "pos": {"view": true, "create": true, "print": true},
    "invoices": {"view": true, "print": true},
    "returns": {"view": true, "create": true},
    "customers": {"view": true, "create": true}
  }'::jsonb,
  false
)
ON CONFLICT (name) DO NOTHING;

-- 3. تحديث صلاحيات دور المدير (إضافة pos)
UPDATE roles 
SET permissions = '{
  "dashboard": {"view": true},
  "branches": {"view": true, "create": true, "edit": true, "delete": true},
  "products": {"view": true, "create": true, "edit": true, "delete": true},
  "invoices": {"view": true, "create": true, "edit": true, "delete": true, "print": true, "export": true},
  "returns": {"view": true, "create": true, "print": true, "export": true},
  "payments": {"view": true, "create": true, "print": true, "export": true},
  "branch_accounts": {"view": true, "export": true},
  "account_statement": {"view": true, "print": true, "export": true},
  "inventory": {"view": true, "create": true, "edit": true, "adjust": true, "transfer": true},
  "expenses": {"view": true, "create": true, "edit": true, "delete": true, "print": true, "export": true},
  "reports": {"view": true, "export": true},
  "accounting": {"view": true, "create": true, "edit": true, "export": true},
  "users": {"view": true, "create": true, "edit": true, "delete": true},
  "roles": {"view": true, "create": true, "edit": true, "delete": true},
  "settings": {"view": true, "edit": true},
  "activity_log": {"view": true},
  "customers": {"view": true, "create": true, "edit": true, "delete": true},
  "payment_methods": {"view": true, "create": true, "edit": true, "delete": true},
  "expense_categories": {"view": true, "create": true, "edit": true, "delete": true},
  "chart_of_accounts": {"view": true, "create": true, "edit": true, "delete": true},
  "inventory_transfers": {"view": true, "create": true, "edit": true},
  "inventory_counts": {"view": true, "create": true, "edit": true},
  "accounting_reports": {"view": true, "export": true},
  "sales": {"view": true, "export": true},
  "pos": {"view": true, "create": true, "print": true}
}'::jsonb,
updated_at = now()
WHERE name = 'admin';

-- 4. تحديث صلاحيات مدير الفرع (إضافة pos + customers)
UPDATE roles 
SET permissions = '{
  "dashboard": {"view": true},
  "pos": {"view": true, "create": true, "print": true},
  "invoices": {"view": true, "create": true, "edit": true, "print": true, "export": true},
  "returns": {"view": true, "create": true, "print": true, "export": true},
  "payments": {"view": true, "create": true, "print": true, "export": true},
  "branch_accounts": {"view": true},
  "account_statement": {"view": true, "print": true, "export": true},
  "customers": {"view": true, "create": true},
  "reports": {"view": true, "export": true},
  "settings": {"view": true},
  "sales": {"view": true, "export": true}
}'::jsonb,
updated_at = now()
WHERE name = 'branch_manager';

-- 5. تحديث صلاحيات المحاسب (إضافة sales)
UPDATE roles 
SET permissions = '{
  "dashboard": {"view": true},
  "reports": {"view": true, "export": true},
  "accounting": {"view": true, "create": true, "edit": true, "export": true},
  "branch_accounts": {"view": true, "export": true},
  "account_statement": {"view": true, "print": true, "export": true},
  "sales": {"view": true, "export": true}
}'::jsonb,
updated_at = now()
WHERE name = 'accountant';

-- 6. تحديث صلاحيات أمين المخزن (بدون تغيير)
UPDATE roles 
SET permissions = '{
  "inventory": {"view": true, "create": true, "edit": true, "adjust": true}
}'::jsonb,
updated_at = now()
WHERE name = 'warehouse_keeper';
