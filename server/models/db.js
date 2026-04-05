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

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const schemaSql = await fs.readFile(schemaPath, 'utf-8');
  await query(schemaSql);

  if (config.superAdminEmail && config.superAdminPassword) {
    const passwordHash = await bcrypt.hash(config.superAdminPassword, 12);
    await query(
      `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, 'admin')
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        password = EXCLUDED.password,
        role = 'admin';
      `,
      [config.superAdminName, config.superAdminEmail.toLowerCase(), passwordHash]
    );
    console.log('[DB] Super admin upserted:', config.superAdminEmail);
  }
}

module.exports = {
  pool,
  query,
  initializeDatabase
};
