const { query } = require('../models/db');
const { requiredString, validateEnum, validateNumber } = require('../middleware/validate');

const KIT_TYPES = ['home', 'bridge', 'cctv', 'business'];

async function createProduct(req, res) {
  try {
    const { name, category, price, cost, description, image_url } = req.body || {};

    if (!requiredString(name) || !requiredString(category) || !validateNumber(price) || !validateNumber(cost)) {
      return res.status(400).json({ success: false, error: 'name, category, price, and cost are required.' });
    }

    const result = await query(
      `
      INSERT INTO products (name, category, price, cost, description, image_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
      `,
      [name.trim(), category.trim(), price, cost, description?.trim() || '', image_url?.trim() || null]
    );

    return res.status(201).json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('[POST /admin/product] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create product.' });
  }
}

async function updateProduct(req, res) {
  try {
    const id = Number(req.params.id);
    const { name, category, price, cost, description, image_url } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product id.' });
    }

    const result = await query(
      `
      UPDATE products
      SET name = COALESCE($2, name),
          category = COALESCE($3, category),
          price = COALESCE($4, price),
          cost = COALESCE($5, cost),
          description = COALESCE($6, description),
          image_url = COALESCE($7, image_url)
      WHERE id = $1
      RETURNING *;
      `,
      [
        id,
        requiredString(name) ? name.trim() : null,
        requiredString(category) ? category.trim() : null,
        validateNumber(price) ? price : null,
        validateNumber(cost) ? cost : null,
        requiredString(description) ? description.trim() : null,
        requiredString(image_url) ? image_url.trim() : null
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    return res.json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/product/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update product.' });
  }
}

async function deleteProduct(req, res) {
  try {
    const id = Number(req.params.id);
    const result = await query('DELETE FROM products WHERE id = $1 RETURNING id;', [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('[DELETE /admin/product/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete product.' });
  }
}

async function createKit(req, res) {
  try {
    const { name, type, price, difficulty, requires_technician, description } = req.body || {};

    if (
      !requiredString(name) ||
      !validateEnum(type, KIT_TYPES) ||
      !validateNumber(price) ||
      !requiredString(difficulty) ||
      typeof requires_technician !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        error: 'name, valid type, price, difficulty, and requires_technician are required.'
      });
    }

    const result = await query(
      `
      INSERT INTO kits (name, type, price, difficulty, requires_technician, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
      `,
      [name.trim(), type, price, difficulty.trim(), requires_technician, description?.trim() || '']
    );

    return res.status(201).json({ success: true, kit: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Kit type already exists.' });
    }
    console.error('[POST /admin/kit] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create kit.' });
  }
}

async function dashboard(req, res) {
  try {
    const [users, bookings, products] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users;'),
      query('SELECT COUNT(*)::int AS count FROM bookings;'),
      query('SELECT COUNT(*)::int AS count FROM products;')
    ]);

    return res.json({
      success: true,
      stats: {
        users: users.rows[0].count,
        bookings: bookings.rows[0].count,
        products: products.rows[0].count
      }
    });
  } catch (error) {
    console.error('[GET /admin/dashboard] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load dashboard.' });
  }
}

async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'File upload is required.' });
  }

  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  return res.status(201).json({ success: true, imageUrl });
}

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  createKit,
  dashboard,
  uploadImage
};
