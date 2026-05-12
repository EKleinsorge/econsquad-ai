-- ============================================================
-- EconSquad AI — Storage Buckets for Book PDFs & Shop Images
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Bucket for book PDFs (free chapter + full book)
INSERT INTO storage.buckets (id, name, public)
VALUES ('books', 'books', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket for shop product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-images', 'shop-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public to read from both buckets
CREATE POLICY "Public read books" ON storage.objects
  FOR SELECT USING (bucket_id = 'books');

CREATE POLICY "Public read shop-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'shop-images');

-- Allow authenticated users (you, the admin) to upload
CREATE POLICY "Auth upload books" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'books' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth upload shop-images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'shop-images' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth delete books" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'books' AND auth.role() = 'authenticated'
  );

CREATE POLICY "Auth delete shop-images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'shop-images' AND auth.role() = 'authenticated'
  );
