const router = require('express').Router();
const { query } = require('../models/db');

router.get('/kits', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM kits ORDER BY id ASC;');
    return res.json({ success: true, kits: result.rows });
  } catch (error) {
    console.error('[GET /kits] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load kits.' });
  }
});

router.get('/products', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM products ORDER BY id DESC;');
    return res.json({ success: true, products: result.rows });
  } catch (error) {
    console.error('[GET /products] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load products.' });
  }
});


router.get('/services', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM services ORDER BY id DESC;');
    return res.json({ success: true, services: result.rows });
  } catch (error) {
    console.error('[GET /services] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load services.' });
  }
});

module.exports = router;
