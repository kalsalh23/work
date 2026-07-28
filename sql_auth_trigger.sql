-- يشغل أوتوماتيكياً عند إضافة مشرف جديد في جدول admins
-- ينشئ حساباً مقابلاً في auth.users لكي تعمل ميزة تسجيل الدخول ونسيت كلمة السر

CREATE OR REPLACE FUNCTION sync_admin_to_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- إذا كان الحساب غير موجود مسبقاً في auth.users
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

-- تفعيل التريغر على insert
DROP TRIGGER IF EXISTS trg_sync_admin_to_auth ON admins;
CREATE TRIGGER trg_sync_admin_to_auth
  AFTER INSERT ON admins
  FOR EACH ROW
  EXECUTE FUNCTION sync_admin_to_auth();
