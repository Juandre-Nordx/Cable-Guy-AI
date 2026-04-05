const { query } = require('../models/db');
const { validateEnum } = require('../middleware/validate');

const ORDER_STATUSES = ['placed', 'processing', 'out_for_delivery', 'delivered', 'done'];

async function createOrder(req, res) {
  try {
    const kitId = Number(req.body?.kit_id);

    if (!Number.isInteger(kitId) || kitId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid kit_id is required.' });
    }

    const kitResult = await query('SELECT id FROM kits WHERE id = $1;', [kitId]);
    if (!kitResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Kit not found.' });
    }

    const result = await query(
      `
      INSERT INTO orders (user_id, kit_id, status)
      VALUES ($1, $2, 'placed')
      RETURNING *;
      `,
      [req.user.id, kitId]
    );

    return res.status(201).json({ success: true, message: 'Order placed successfully.', order: result.rows[0] });
  } catch (error) {
    console.error('[POST /orders] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to place order.' });
  }
}

async function listMyOrders(req, res) {
  try {
    const result = await query(
      `
      SELECT o.*, k.name AS kit_name, k.type AS kit_type, k.price AS kit_price
      FROM orders o
      LEFT JOIN kits k ON k.id = o.kit_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC;
      `,
      [req.user.id]
    );

    return res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('[GET /orders/my] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load orders.' });
  }
}

async function listAllOrders(req, res) {
  try {
    const result = await query(
      `
      SELECT
        o.id,
        o.user_id,
        o.kit_id,
        o.status,
        o.created_at,
        u.name AS customer_name,
        u.email AS customer_email,
        u.contact_number AS customer_contact_number,
        u.address AS customer_address,
        k.name AS kit_name,
        k.type AS kit_type
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN kits k ON k.id = o.kit_id
      ORDER BY o.created_at DESC;
      `
    );

    return res.json({ success: true, orders: result.rows });
  } catch (error) {
    console.error('[GET /admin/orders] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load orders.' });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isInteger(id) || id <= 0 || !validateEnum(status, ORDER_STATUSES)) {
      return res.status(400).json({
        success: false,
        error: `Valid order id and status are required (${ORDER_STATUSES.join(', ')}).`
      });
    }

    const result = await query('UPDATE orders SET status = $2 WHERE id = $1 RETURNING *;', [id, status]);

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    return res.json({ success: true, message: 'Order status updated.', order: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/orders/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update order status.' });
  }
}

module.exports = {
  ORDER_STATUSES,
  createOrder,
  listMyOrders,
  listAllOrders,
  updateOrderStatus
};
