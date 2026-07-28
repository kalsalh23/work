-- ============================================================
-- سكريبت إعداد Supabase الكامل
-- قم بتشغيل هذا السكريبت في Supabase SQL Editor
-- ============================================================

-- 1. إنشاء جدول categories
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. إنشاء جدول products مع عمود images من نوع JSONB
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  images JSONB DEFAULT '[]'::jsonb NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. إنشاء جدول admins
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. إضافة المدير الافتراضي
INSERT INTO admins (email, password) VALUES ('yousf@gmail.com', '123456')
ON CONFLICT (email) DO NOTHING;

-- 5. إنشاء حساب المدير في auth.users (لكي تعمل ميزة تسجيل الدخول ونسيت كلمة السر)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN SELECT email, password FROM admins LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = admin_record.email) THEN
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        admin_record.email,
        extensions.crypt(admin_record.password, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        '{}',
        now(),
        now(),
        '',
        ''
      );
    END IF;
  END LOOP;
END $$;

-- 6. تفعيل RLS على جميع الجداول
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 7. سياسات RLS لجدول admins (السماح للجميع بقراءة بيانات المشرفين)
DROP POLICY IF EXISTS "Enable select for anon" ON admins;
CREATE POLICY "Enable select for anon" ON admins FOR SELECT USING (true);

-- 8. سياسات RLS لجداول categories و products (السماح للجميع بكل العمليات)
DROP POLICY IF EXISTS "Enable all for anon" ON categories;
DROP POLICY IF EXISTS "Enable all for anon" ON products;
CREATE POLICY "Enable all for anon" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON products FOR ALL USING (true) WITH CHECK (true);

-- 9. إنشاء bucket للتخزين (للمنتجات)
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 10. سياسات التخزين (السماح للجميع بقراءة ورفع وحذف الملفات)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow Upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow Delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow Update" ON storage.objects;

CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Allow Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "Allow Delete" ON storage.objects FOR DELETE USING (bucket_id = 'product-images');
CREATE POLICY "Allow Update" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');

-- 11. إضافة التريغر لمزامنة المشرفين الجدد مع auth.users
CREATE OR REPLACE FUNCTION sync_admin_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = NEW.email) THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      NEW.email,
      extensions.crypt(NEW.password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now(),
      '',
      ''
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_to_auth ON admins;
CREATE TRIGGER trg_sync_admin_to_auth
  AFTER INSERT ON admins
  FOR EACH ROW
  EXECUTE FUNCTION sync_admin_to_auth();

-- 12. إضافة أصناف افتراضية
INSERT INTO categories (name) VALUES ('آليات'), ('اجهزة'), ('معدات'), ('غيرها')
ON CONFLICT (name) DO NOTHING;