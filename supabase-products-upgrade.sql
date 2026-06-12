-- ==========================================
-- تحديث جدول المنتجات + إنشاء جدول الفئات
-- مصنع الصادق - نظام علي الصادق
-- ==========================================

-- 1. إنشاء جدول الفئات
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. إضافة أعمدة جديدة لجدول المنتجات
ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'piece';
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- 3. كود المنتج يكون فريد
CREATE UNIQUE INDEX IF NOT EXISTS products_code_key ON products(code);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_key ON products(barcode) WHERE barcode IS NOT NULL;

-- 4. إنشاء كود تلقائي للمنتجات الموجودة اللي مفيهاش كود
DO $$
DECLARE
  rec RECORD;
  counter INT := 1;
BEGIN
  FOR rec IN SELECT id FROM products WHERE code IS NULL ORDER BY created_at LOOP
    UPDATE products SET code = 'PRD-' || LPAD(counter::TEXT, 4, '0') WHERE id = rec.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- 5. إضافة فئات افتراضية
INSERT INTO categories (name, sort_order) VALUES
  ('حلويات شرقية', 1),
  ('حلويات غربية', 2),
  ('كنافة', 3),
  ('بقلاوة', 4),
  ('كيك', 5),
  ('معجنات', 6),
  ('مشروبات', 7),
  ('أخرى', 99)
ON CONFLICT (name) DO NOTHING;

-- 6. تفعيل RLS على جدول الفئات
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 7. سياسات RLS للفئات
CREATE POLICY "Allow read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Allow insert categories" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update categories" ON categories FOR UPDATE USING (true);
CREATE POLICY "Allow delete categories" ON categories FOR DELETE USING (true);
