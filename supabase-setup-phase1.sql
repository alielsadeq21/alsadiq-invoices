-- ==========================================
-- المرحلة الأولى: نظام الصلاحيات والأدوار
-- مصنع الصادق - نظام فواتير الصرف
-- ==========================================
-- يُرجى تنفيذ هذا السكربت في Supabase SQL Editor
-- ==========================================

-- 1. إنشاء جدول الأدوار
CREATE TABLE IF NOT EXISTS roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. إضافة أعمدة جديدة لجدول المستخدمين (إذا لم تكن موجودة)
DO $$
BEGIN
  -- role_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role_id') THEN
    ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id);
  END IF;

  -- branch_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'branch_id') THEN
    ALTER TABLE users ADD COLUMN branch_id UUID REFERENCES branches(id);
  END IF;

  -- is_active
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_active') THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;

  -- must_change_password
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'must_change_password') THEN
    ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT false;
  END IF;

  -- last_login
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login') THEN
    ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;
  END IF;

  -- created_by
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'created_by') THEN
    ALTER TABLE users ADD COLUMN created_by UUID REFERENCES users(id);
  END IF;
END $$;

-- 3. إدراج الأدوار الافتراضية
INSERT INTO roles (name, display_name, description, permissions, is_system) VALUES
(
  'admin',
  'مدير النظام',
  'يتحكم في كل شيء - صلاحيات كاملة',
  '{
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
    "expense_categories": {"view": true, "create": true, "edit": true, "delete": true}
  }'::jsonb,
  true
),
(
  'branch_manager',
  'مدير فرع',
  'يدير فرعه فقط - فواتير ومرتجعات وقبض وتقارير',
  '{
    "dashboard": {"view": true},
    "invoices": {"view": true, "create": true, "edit": true, "print": true, "export": true},
    "returns": {"view": true, "create": true, "print": true, "export": true},
    "payments": {"view": true, "create": true, "print": true, "export": true},
    "branch_accounts": {"view": true},
    "account_statement": {"view": true, "print": true, "export": true},
    "reports": {"view": true, "export": true},
    "settings": {"view": true}
  }'::jsonb,
  true
),
(
  'warehouse_keeper',
  'أمين مخزن',
  'يدير المخزون فقط',
  '{
    "inventory": {"view": true, "create": true, "edit": true, "adjust": true}
  }'::jsonb,
  true
),
(
  'accountant',
  'محاسب',
  'يشوف التقارير والقيود المحاسبية',
  '{
    "dashboard": {"view": true},
    "reports": {"view": true, "export": true},
    "accounting": {"view": true, "create": true, "edit": true, "export": true},
    "branch_accounts": {"view": true, "export": true},
    "account_statement": {"view": true, "print": true, "export": true}
  }'::jsonb,
  true
) ON CONFLICT (name) DO NOTHING;

-- 4. ربط المستخدم الحالي (admin) بدور مدير النظام
UPDATE users SET
  role_id = (SELECT id FROM roles WHERE name = 'admin' LIMIT 1),
  is_active = true
WHERE username = 'admin';

-- إذا مفيش مستخدم admin، حدّث أول مستخدم
UPDATE users SET
  role_id = (SELECT id FROM roles WHERE name = 'admin' LIMIT 1),
  is_active = true
WHERE role_id IS NULL AND id = (SELECT MIN(id) FROM users);

-- 5. تفعيل RLS على جدول الأدوار
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- سياسات الأدوار: الكل يقرأ، التعديل للمدير فقط
CREATE POLICY "Anyone can read roles" ON roles
  FOR SELECT USING (true);

CREATE POLICY "Admin can insert roles" ON roles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin can update roles" ON roles
  FOR UPDATE USING (true);

CREATE POLICY "Admin can delete roles" ON roles
  FOR DELETE USING (true);

-- 6. تحديث RLS على جدول المستخدمين
-- الكل يقرأ نفسه، المدير يقرأ الكل
CREATE POLICY "Users can read themselves" ON users
  FOR SELECT USING (true);

CREATE POLICY "Admin can insert users" ON users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin can update users" ON users
  FOR UPDATE USING (true);

CREATE POLICY "Admin can delete users" ON users
  FOR DELETE USING (true);

-- 7. إضافة أعمدة الإعدادات (طباعة أبيض وأسود + فترة الخروج التلقائي)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'bw_print') THEN
    ALTER TABLE settings ADD COLUMN bw_print BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'idle_timeout_minutes') THEN
    ALTER TABLE settings ADD COLUMN idle_timeout_minutes INTEGER DEFAULT 15;
  END IF;
END $$;

-- ✅ تم بنجاح!
-- بعد التنفيذ: أعد تسجيل الدخول حتى تُحمّل الصلاحيات الجديدة
