const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../models/db');
const config = require('../config');
const { requiredString, validateEmail } = require('../middleware/validate');

function buildToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

async function register(req, res) {
  try {
    const { name, email, password, role } = req.body || {};
    const normalizedRole = role === 'admin' ? 'admin' : 'user';

    if (!requiredString(name) || !validateEmail(email) || !requiredString(password) || String(password).length < 8) {
      return res.status(400).json({
        success: false,
        error: 'name, valid email, and password (min 8 chars) are required.'
      });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const result = await query(
      `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role, created_at;
      `,
      [String(name).trim(), String(email).trim().toLowerCase(), passwordHash, normalizedRole]
    );

    const user = result.rows[0];
    const token = buildToken(user);
    return res.status(201).json({ success: true, user, token });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Email already exists.' });
    }
    console.error('[POST /auth/register] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Registration failed.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!validateEmail(email) || !requiredString(password)) {
      return res.status(400).json({ success: false, error: 'Valid email and password are required.' });
    }

    const result = await query('SELECT id, name, email, password, role, created_at FROM users WHERE email = $1;', [
      String(email).trim().toLowerCase()
    ]);

    const userRow = result.rows[0];
    if (!userRow) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const ok = await bcrypt.compare(String(password), userRow.password);
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      created_at: userRow.created_at
    };

    const token = buildToken(user);
    return res.json({ success: true, user, token });
  } catch (error) {
    console.error('[POST /auth/login] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Login failed.' });
  }
}

module.exports = { register, login };
