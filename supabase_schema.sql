-- Create categories table
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create products table
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  image_url TEXT,
  category_id BIGINT REFERENCES categories(id),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default admin (change password after first login)
INSERT INTO admins (email, password) VALUES ('yousf@gmail.com', '123456')
ON CONFLICT (email) DO NOTHING;

-- Enable RLS on admins and allow anonymous select
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable select for anon" ON admins;
CREATE POLICY "Enable select for anon" ON admins FOR SELECT USING (true);

-- Create storage bucket for product images
-- Run this in Supabase SQL editor:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true);

-- Set up storage policy (allow public read)
-- CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
-- CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');

-- Add barcode column to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT UNIQUE DEFAULT NULL;