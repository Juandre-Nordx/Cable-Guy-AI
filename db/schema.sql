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
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kits (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL UNIQUE CHECK (type IN ('home', 'bridge', 'cctv', 'business')),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  difficulty TEXT NOT NULL,
  requires_technician BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE kits ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE kits ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE kits ADD COLUMN IF NOT EXISTS video_url TEXT;

CREATE TABLE IF NOT EXISTS kit_steps (
  id SERIAL PRIMARY KEY,
  kit_id INTEGER NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number > 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  UNIQUE (kit_id, step_number)
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  kit_id INTEGER REFERENCES kits(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'processing', 'out_for_delivery', 'delivered', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

WITH seed_kits (name, type, price, difficulty, requires_technician, description) AS (
  VALUES
    ('Home WiFi Kit', 'home', 199.99::numeric, 'easy', false, 'Dual-node mesh kit for apartments and homes with dead zones.'),
    ('Bridge Kit', 'bridge', 299.00::numeric, 'medium', true, 'Point-to-point bridge kit to connect detached buildings or garages.'),
    ('CCTV Kit', 'cctv', 399.00::numeric, 'medium', true, 'CCTV package with NVR and PoE cameras for secure monitoring.'),
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
  WHERE k.type = sk.type
  RETURNING k.type
)
INSERT INTO kits (name, type, price, difficulty, requires_technician, description)
SELECT sk.name, sk.type, sk.price, sk.difficulty, sk.requires_technician, sk.description
FROM seed_kits sk
WHERE NOT EXISTS (
  SELECT 1
  FROM kits k
  WHERE k.type = sk.type
);
