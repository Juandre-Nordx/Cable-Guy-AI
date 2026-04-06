const { query } = require('../models/db');
const { validateEnum, requiredString } = require('../middleware/validate');

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
      SELECT o.*, k.name AS kit_name, k.category AS kit_category, k.price AS kit_price
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
        k.category AS kit_category
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

    const existingResult = await query('SELECT id, status FROM orders WHERE id = $1;', [id]);
    const existing = existingResult.rows[0];
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    if (existing.status === 'done') {
      return res.status(409).json({ success: false, error: 'Order is already completed and cannot be updated.' });
    }

    const result = await query('UPDATE orders SET status = $2 WHERE id = $1 RETURNING *;', [id, status]);
    return res.json({ success: true, message: status === 'done' ? 'Order Completed' : 'Order status updated.', order: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/orders/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update order status.' });
  }
}

async function getAccessibleOrder(orderId, user) {
  const result = await query(
    `
    SELECT id, user_id
    FROM orders
    WHERE id = $1;
    `,
    [orderId]
  );

  const order = result.rows[0];
  if (!order) {
    return { error: { status: 404, message: 'Order not found.' } };
  }

  const isOwner = Number(order.user_id) === Number(user.id);
  const isAdmin = user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return { error: { status: 403, message: 'You do not have access to this order.' } };
  }

  return { order };
}

async function listOrderNotes(req, res) {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ success: false, error: 'Valid order id is required.' });
    }

    const access = await getAccessibleOrder(orderId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ success: false, error: access.error.message });
    }

    const result = await query(
      `
      SELECT id, order_id, message, created_by, created_at
      FROM order_notes
      WHERE order_id = $1
      ORDER BY created_at ASC;
      `,
      [orderId]
    );

    return res.json({ success: true, notes: result.rows });
  } catch (error) {
    console.error('[GET /orders/:id/notes] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load order notes.' });
  }
}

async function createOrderNote(req, res) {
  try {
    const orderId = Number(req.params.id);
    const message = req.body?.message;

    if (!Number.isInteger(orderId) || orderId <= 0 || !requiredString(message)) {
      return res.status(400).json({ success: false, error: 'Valid order id and note message are required.' });
    }

    const access = await getAccessibleOrder(orderId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({ success: false, error: access.error.message });
    }

    const createdBy = req.user.role === 'admin' ? 'admin' : 'user';
    const result = await query(
      `
      INSERT INTO order_notes (order_id, message, created_by)
      VALUES ($1, $2, $3)
      RETURNING id, order_id, message, created_by, created_at;
      `,
      [orderId, message.trim(), createdBy]
    );

    return res.status(201).json({ success: true, note: result.rows[0] });
  } catch (error) {
    console.error('[POST /orders/:id/note] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to save order note.' });
  }
}

async function createAdminOrderNote(req, res) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }

  return createOrderNote(req, res);
}

module.exports = {
  ORDER_STATUSES,
  createOrder,
  listMyOrders,
  listAllOrders,
  updateOrderStatus,
  listOrderNotes,
  createOrderNote,
  createAdminOrderNote
};
