const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config');

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required for production backend.');
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

const query = (text, params = []) => pool.query(text, params);

async function createDefaultAdmin() {
  const email = String(config.superAdminEmail || '')
    .trim()
    .toLowerCase();
  const password = String(config.superAdminPassword || '').trim();

  if (!email || !password) {
    console.log('[DB] SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set. Skipping default admin creation.');
    return;
  }

  const existing = await query('SELECT id FROM users WHERE email = $1 LIMIT 1;', [email]);
  if (existing.rows[0]) {
    console.log('[DB] Super admin exists');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `
    INSERT INTO users (name, contact_number, email, address, password, role)
    VALUES ($1, $2, $3, $4, $5, 'admin');
    `,
    ['Super Admin', '', email, '', passwordHash]
  );

  console.log('[DB] Super admin created');
}

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf-8');
  await query(schemaSql);
  await createDefaultAdmin();
}

module.exports = {
  pool,
  query,
  initializeDatabase,
  createDefaultAdmin
};
