-- ============================================================
-- EconSquad AI — Swag Shop Products Table
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS shop_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'apparel',
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  badge text,
  stripe_link text,
  emoji text DEFAULT '🛍️',
  image_url text,
  active boolean DEFAULT true,
  coming_soon boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shop_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON shop_products
  FOR SELECT USING (true);

CREATE POLICY "Auth write" ON shop_products
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
