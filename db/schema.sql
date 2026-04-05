CREATE TABLE IF NOT EXISTS kits (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  kit_id INTEGER REFERENCES kits(id),
  status TEXT NOT NULL DEFAULT 'pending'
);

INSERT INTO kits(name, type, description, price, difficulty)
VALUES
  ('Home WiFi Kit', 'home', 'Dual-node mesh kit for apartments and homes with dead zones.', 199.99, 'easy'),
  ('Bridge Kit', 'bridge', 'Point-to-point bridge kit to connect detached buildings or garages.', 299.00, 'medium'),
  ('Business Network Kit', 'business', 'Router + managed switch + access points for multi-user environments.', 549.00, 'medium')
ON CONFLICT(type) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  difficulty = EXCLUDED.difficulty;
