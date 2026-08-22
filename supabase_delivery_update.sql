-- ============================================================
-- تحديث جدول التسليم ليشمل الحقول الجديدة المطلوبة في واجهة التسليم:
-- الرقم, التاريخ, الأسم, النوع, الوصف, الجهة الرسمية, البلد المهدي, البلد المستلم, نوع الزيارة
-- الرقم = رقم القطع (delivery_number)
-- ============================================================

-- إضافة الأعمدة الجديدة إذا لم تكن موجودة
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS donor_country TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS recipient_country TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS visit_type TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS gift_type TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS gift_description TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_number TEXT;

-- تحديث دالة deliver_product لتدعم الحقول الجديدة (اختيارية)
DROP FUNCTION IF EXISTS deliver_product(BIGINT, INTEGER, TEXT, DATE, TEXT);

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

-- فهارس جديدة
CREATE INDEX IF NOT EXISTS idx_deliveries_recipient_country ON deliveries(recipient_country);
CREATE INDEX IF NOT EXISTS idx_deliveries_visit_type ON deliveries(visit_type);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivery_number ON deliveries(delivery_number);

-- عرض محدث لسجل التسليم اليومي
CREATE OR REPLACE VIEW v_deliveries_daily AS
SELECT
  delivery_date,
  COUNT(*) as deliveries_count,
  SUM(quantity_delivered) as total_quantity,
  array_agg(delivered_to) as recipients
FROM deliveries
GROUP BY delivery_date
ORDER BY delivery_date DESC;
