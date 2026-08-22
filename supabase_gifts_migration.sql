-- ============================================================
-- ترقية نظام thestore لنظام أرشفة الهدايا + التسليم
-- الحقول المطلوبة:
-- تاريخ أرشفة الهدية, عدد الهدايا, اسم الهدية, نوع الهدية
-- وصف الهدية, تاريخ الاستلام, تاريخ التسليم, البلد المهدي
-- السعر التقريبي, المناسبة الرسمية
-- ============================================================

-- 1. إضافة الحقول الجديدة لجدول products (كلها nullable للتوافق مع البيانات القديمة)
ALTER TABLE products ADD COLUMN IF NOT EXISTS gift_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gift_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS archive_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS received_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS donor_country TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS occasion TEXT;

-- details القديم سيبقى للتوافق، لكن نزامنه مع gift_description إذا لزم
-- quantity يمثل عدد الهدايا

-- 2. تحديث البيانات القديمة: تعيين archive_date = created_at::date حيث archive_date IS NULL
UPDATE products SET archive_date = created_at::date WHERE archive_date IS NULL;
UPDATE products SET gift_description = details WHERE gift_description IS NULL AND details IS NOT NULL;
UPDATE products SET gift_type = (SELECT name FROM categories WHERE categories.id = products.category_id) WHERE gift_type IS NULL;

-- 3. إنشاء جدول التسليم deliveries
CREATE TABLE IF NOT EXISTS deliveries (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_delivered INTEGER NOT NULL CHECK (quantity_delivered > 0),
  delivered_to TEXT NOT NULL,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient_entity TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. تفعيل RLS وسياسات للسماح للجميع
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for anon" ON deliveries;
CREATE POLICY "Enable all for anon" ON deliveries FOR ALL USING (true) WITH CHECK (true);

-- 5. فهرس لتسريع الفلترة حسب اليوم
CREATE INDEX IF NOT EXISTS idx_products_archive_date ON products(archive_date);
CREATE INDEX IF NOT EXISTS idx_products_received_date ON products(received_date);
CREATE INDEX IF NOT EXISTS idx_products_delivery_date ON products(delivery_date);
CREATE INDEX IF NOT EXISTS idx_products_created_at_date ON products((created_at::date));
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_date ON deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_product_id ON deliveries(product_id);

-- 6. دالة لتسليم كمية مع التحقق من المخزون (اختيارية - يمكن استدعاؤها من الكود)
CREATE OR REPLACE FUNCTION deliver_product(
  p_product_id BIGINT,
  p_quantity INTEGER,
  p_delivered_to TEXT,
  p_delivery_date DATE,
  p_notes TEXT DEFAULT NULL
) RETURNS deliveries AS $$
DECLARE
  v_product products%ROWTYPE;
  v_delivery deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;
  IF v_product.quantity < p_quantity THEN
    RAISE EXCEPTION 'الكمية المطلوبة (%) أكبر من المخزون المتاح (%)', p_quantity, v_product.quantity;
  END IF;

  UPDATE products SET quantity = quantity - p_quantity WHERE id = p_product_id;

  INSERT INTO deliveries (product_id, quantity_delivered, delivered_to, delivery_date, notes)
  VALUES (p_product_id, p_quantity, p_delivered_to, p_delivery_date, p_notes)
  RETURNING * INTO v_delivery;

  RETURN v_delivery;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. عرض مجمع للهدايا حسب اليوم (للفلترة والتصدير)
CREATE OR REPLACE VIEW v_gifts_daily AS
SELECT
  archive_date,
  COUNT(*) as gifts_count,
  SUM(quantity) as total_quantity,
  array_agg(name) as gift_names
FROM products
GROUP BY archive_date
ORDER BY archive_date DESC;
