const router = require('express').Router();
const { query } = require('../models/db');

router.get('/kits', async (_req, res) => {
  try {
    const result = await query(
      `
      WITH current_currency AS (
        SELECT COALESCE(
          (SELECT value FROM settings WHERE key = 'currency' LIMIT 1),
          'ZAR'
        ) AS currency
      )
      SELECT
        k.id,
        k.name,
        k.category,
        k.price,
        cc.currency,
        k.difficulty,
        k.requires_technician,
        k.description,
        k.instructions,
        k.image_url,
        k.video_url,
        k.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ks.id,
              'step_number', ks.step_number,
              'title', ks.title,
              'description', ks.description,
              'image_url', ks.image_url
            )
            ORDER BY ks.step_number
          ) FILTER (WHERE ks.id IS NOT NULL),
          '[]'::json
        ) AS steps
      FROM kits k
      CROSS JOIN current_currency cc
      LEFT JOIN kit_steps ks ON ks.kit_id = k.id
      GROUP BY k.id, cc.currency
      ORDER BY k.id ASC;
      `
    );

    return res.json({ success: true, kits: result.rows });
  } catch (error) {
    console.error('[GET /kits] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load kits.' });
  }
});

router.get('/products', async (_req, res) => {
  try {
    const result = await query(
      `
      WITH current_currency AS (
        SELECT COALESCE(
          (SELECT value FROM settings WHERE key = 'currency' LIMIT 1),
          'ZAR'
        ) AS currency
      )
      SELECT p.*, cc.currency
      FROM products p
      CROSS JOIN current_currency cc
      ORDER BY p.id DESC;
      `
    );
    return res.json({ success: true, products: result.rows });
  } catch (error) {
    console.error('[GET /products] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load products.' });
  }
});


router.get('/services', async (_req, res) => {
  try {
    const result = await query(
      `
      WITH current_currency AS (
        SELECT COALESCE(
          (SELECT value FROM settings WHERE key = 'currency' LIMIT 1),
          'ZAR'
        ) AS currency
      )
      SELECT s.*, cc.currency
      FROM services s
      CROSS JOIN current_currency cc
      ORDER BY s.id DESC;
      `
    );
    return res.json({ success: true, services: result.rows });
  } catch (error) {
    console.error('[GET /services] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load services.' });
  }
});

module.exports = router;
