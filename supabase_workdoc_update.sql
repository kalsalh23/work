-- ============================================================
-- تحديث واجهة التوثيق - إضافة حقول التوثيق لجدول products
-- الحقول: الرقم, التاريخ, الأسم, النوع, الوصف, الجهة الرسمية, البلد المهدي, البلد المستلم, نوع الزيارة, الصورة
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS recipient_country TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS official_entity TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS visit_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_number TEXT;

-- فهارس
CREATE INDEX IF NOT EXISTS idx_products_recipient_country ON products(recipient_country);
CREATE INDEX IF NOT EXISTS idx_products_visit_type ON products(visit_type);
CREATE INDEX IF NOT EXISTS idx_products_delivery_number ON products(delivery_number);
