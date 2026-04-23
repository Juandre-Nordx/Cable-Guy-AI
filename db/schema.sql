CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  cost NUMERIC(10,2) NOT NULL CHECK (cost >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  main_image TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kits (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE,
  difficulty TEXT NOT NULL,
  requires_technician BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  main_image TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE kits ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE kits ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE kits ADD COLUMN IF NOT EXISTS main_image TEXT;
ALTER TABLE kits ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE kits ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kits ADD COLUMN IF NOT EXISTS is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_image TEXT;

-- Backward-safe migration for renamed kit field
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'kits' AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'kits' AND column_name = 'category'
  ) THEN
    ALTER TABLE kits RENAME COLUMN type TO category;
  END IF;
END $$;

-- Ensure category is not unique so multiple kits can share the same category
ALTER TABLE kits DROP CONSTRAINT IF EXISTS kits_type_key;
ALTER TABLE kits DROP CONSTRAINT IF EXISTS kits_category_key;

-- Normalize legacy kit category/type values to the standardized category set
UPDATE kits
SET category = CASE
  WHEN LOWER(category) IN ('home', 'wifi', 'mesh') THEN 'home'
  WHEN LOWER(category) IN ('bridge', 'ptp') THEN 'bridge'
  WHEN LOWER(category) IN ('cctv', 'camera') THEN 'security'
  WHEN LOWER(category) IN ('ups', 'power') THEN 'backup'
  WHEN LOWER(category) IN ('cabinet', 'pole', 'box') THEN 'infrastructure'
  WHEN LOWER(category) = 'business' THEN 'business'
  WHEN LOWER(category) = 'smart' THEN 'smart'
  ELSE 'home'
END;

-- Apply the category CHECK constraint only after all legacy values have been normalized
ALTER TABLE kits DROP CONSTRAINT IF EXISTS kits_type_check;
ALTER TABLE kits DROP CONSTRAINT IF EXISTS kits_category_check;
ALTER TABLE kits ADD CONSTRAINT kits_category_check
  CHECK (category IN ('home', 'bridge', 'backup', 'security', 'infrastructure', 'business', 'smart'));

CREATE TABLE IF NOT EXISTS kit_steps (
  id SERIAL PRIMARY KEY,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT,
  image_url TEXT,
  UNIQUE (kit_id, step_number)
);
ALTER TABLE kit_steps ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE kit_steps ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE kit_steps ADD COLUMN IF NOT EXISTS step_number INTEGER DEFAULT 1;
ALTER TABLE kit_steps DROP CONSTRAINT IF EXISTS kit_steps_step_number_check;
ALTER TABLE kit_steps ADD CONSTRAINT kit_steps_step_number_check CHECK (step_number > 0);

UPDATE products SET main_image = image_url WHERE main_image IS NULL AND image_url IS NOT NULL;
UPDATE kits SET main_image = image_url WHERE main_image IS NULL AND image_url IS NOT NULL;
UPDATE kit_steps SET image = image_url WHERE image IS NULL AND image_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value)
VALUES ('currency', 'ZAR')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS kit_items (
  id SERIAL PRIMARY KEY,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  UNIQUE (kit_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'processing', 'out_for_delivery', 'delivered', 'done')),
  total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ZAR';

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('product', 'kit', 'service')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0)
);


CREATE TABLE IF NOT EXISTS order_notes (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tech_bookings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  address TEXT NOT NULL,
  problem_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  assigned_technician TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tech_bookings (user_id, kit_id, client_name, contact, address, problem_description, status, created_at)
SELECT user_id, kit_id, name, phone, address, '', 'pending', created_at
FROM bookings
WHERE NOT EXISTS (SELECT 1 FROM tech_bookings);

CREATE TABLE IF NOT EXISTS wizard_nodes (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('question', 'result')),
  message TEXT NOT NULL DEFAULT '',
  category TEXT,
  needs_technician BOOLEAN NOT NULL DEFAULT FALSE,
  recommended_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wizard_nodes
ADD COLUMN IF NOT EXISTS recommended_items JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS wizard_edges (
  id SERIAL PRIMARY KEY,
  from_node_id INTEGER NOT NULL REFERENCES wizard_nodes(id) ON DELETE CASCADE,
  to_node_id INTEGER NOT NULL REFERENCES wizard_nodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wizard_edges_no_self_loop CHECK (from_node_id <> to_node_id),
  CONSTRAINT wizard_edges_unique_choice UNIQUE (from_node_id, label)
);

CREATE INDEX IF NOT EXISTS wizard_edges_from_idx ON wizard_edges(from_node_id);
CREATE INDEX IF NOT EXISTS wizard_edges_to_idx ON wizard_edges(to_node_id);

INSERT INTO wizard_nodes (title, type, message, category, needs_technician)
SELECT 'What network issue are you facing?', 'question', '', NULL, false
WHERE NOT EXISTS (SELECT 1 FROM wizard_nodes);

WITH seed_kits (name, category, price, difficulty, requires_technician, description) AS (
  VALUES
    ('Home WiFi Kit', 'home', 199.99::numeric, 'easy', false, 'Dual-node mesh kit for apartments and homes with dead zones.'),
    ('Bridge Kit', 'bridge', 299.00::numeric, 'medium', true, 'Point-to-point bridge kit to connect detached buildings or garages.'),
    ('CCTV Kit', 'security', 399.00::numeric, 'medium', true, 'CCTV package with NVR and PoE cameras for secure monitoring.'),
    ('Business Network Kit', 'business', 549.00::numeric, 'medium', true, 'Router + managed switch + APs for multi-user environments.')
),
updated AS (
  UPDATE kits k
  SET
    name = sk.name,
    price = sk.price,
    difficulty = sk.difficulty,
    requires_technician = sk.requires_technician,
    description = sk.description
  FROM seed_kits sk
  WHERE k.category = sk.category
  RETURNING k.category
)
INSERT INTO kits (name, category, price, difficulty, requires_technician, description)
SELECT sk.name, sk.category, sk.price, sk.difficulty, sk.requires_technician, sk.description
FROM seed_kits sk
WHERE NOT EXISTS (
  SELECT 1
  FROM kits k
  WHERE k.category = sk.category
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, slug, description, sort_order)
VALUES
  ('Networking Kits', 'networking-kits', 'Pre-built kits for home and business networking.', 1),
  ('CCTV Kits', 'cctv-kits', 'Camera systems, NVR bundles, and surveillance packs.', 2),
  ('UPS / Power Backup', 'ups-power-backup', 'Power continuity solutions for routers, DVRs, and networks.', 3),
  ('Custom Cables', 'custom-cables', 'Cut-to-length cabling with per-meter pricing.', 4),
  ('Accessories', 'accessories', 'Routers, switches, cameras, and mounting accessories.', 5),
  ('Services', 'services', 'Installation, support, and maintenance services.', 6)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE kits ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

UPDATE products
SET category_id = c.id
FROM categories c
WHERE products.category_id IS NULL
  AND (
    LOWER(products.category) = c.slug
    OR LOWER(products.category) = REPLACE(c.slug, '-', ' ')
    OR LOWER(products.category) = REPLACE(c.name, ' / ', ' ')
  );

UPDATE kits
SET category_id = c.id
FROM categories c
WHERE kits.category_id IS NULL
  AND (
    (kits.category = 'security' AND c.slug = 'cctv-kits')
    OR (kits.category = 'backup' AND c.slug = 'ups-power-backup')
    OR (kits.category IN ('home', 'bridge', 'business', 'smart', 'infrastructure') AND c.slug = 'networking-kits')
  );

UPDATE services
SET category_id = c.id
FROM categories c
WHERE services.category_id IS NULL
  AND c.slug = 'services';

CREATE TABLE IF NOT EXISTS guides (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  learn_how TEXT NOT NULL DEFAULT '',
  installation_guide TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS guides_product_id_idx ON guides(product_id);
