const { query } = require('../models/db');
const { requiredString, validateEnum, validateNumber } = require('../middleware/validate');
const { ORDER_STATUSES } = require('./orderController');

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


async function createService(req, res) {
  try {
    const { name, description, price } = req.body || {};

    if (!requiredString(name) || !validateNumber(price)) {
      return res.status(400).json({ success: false, error: 'name and price are required.' });
    }

    const result = await query(
      `
      INSERT INTO services (name, description, price)
      VALUES ($1, $2, $3)
      RETURNING *;
      `,
      [name.trim(), description?.trim() || '', price]
    );

    return res.status(201).json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('[POST /admin/service] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create service.' });
  }
}

async function listUsers(req, res) {
  try {
    const result = await query(
      `
      SELECT id, name, contact_number, email, address, role, created_at
      FROM users
      ORDER BY created_at DESC;
      `
    );
    return res.json({ success: true, users: result.rows });
  } catch (error) {
    console.error('[GET /admin/users] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load users.' });
  }
}

async function dashboard(req, res) {
  try {
    const [usersResult, ordersResult, ordersByStatusResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users;'),
      query('SELECT COUNT(*)::int AS count FROM orders;'),
      query('SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status;')
    ]);

    const ordersByStatus = ORDER_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});

    for (const row of ordersByStatusResult.rows) {
      ordersByStatus[row.status] = row.count;
    }

    return res.json({
      success: true,
      stats: {
        total_users: usersResult.rows[0].count,
        total_orders: ordersResult.rows[0].count,
        orders_by_status: ordersByStatus
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
  createService,
  listUsers,
  dashboard,
  uploadImage
};
