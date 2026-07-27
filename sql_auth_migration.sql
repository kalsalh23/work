-- تشغيل هذا السكريبت في Supabase SQL Editor
-- ينقل حسابات المشرفين من جدول admins إلى auth.users
-- لكي تعمل ميزة "نسيت كلمة السر" عبر Supabase Auth

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  admin_record RECORD;
  new_user_id uuid;
BEGIN
  FOR admin_record IN SELECT email, password FROM admins LOOP
    -- تحقق من أن الحساب غير موجود مسبقاً في auth.users
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
