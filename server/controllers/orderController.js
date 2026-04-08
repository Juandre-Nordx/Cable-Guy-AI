const { pool, query } = require('../models/db');
const { validateEnum, requiredString } = require('../middleware/validate');

const ORDER_STATUSES = ['placed', 'processing', 'out_for_delivery', 'delivered', 'done'];
const ORDERABLE_TABLES = {
  kit: 'kits',
  product: 'products',
  service: 'services'
};

async function getCurrency(client) {
  const result = await client.query("SELECT value FROM settings WHERE key = 'currency' LIMIT 1;");
  return result.rows[0]?.value || 'ZAR';
}

async function normalizeOrderItems(rawItems, client) {
  const cleanItems = Array.isArray(rawItems) ? rawItems : [];

  if (!cleanItems.length) {
    throw new Error('At least one cart item is required.');
  }

  const merged = new Map();

  cleanItems.forEach((item) => {
    const itemId = Number(item?.id);
    const type = String(item?.type || '').toLowerCase();
    const qty = Number(item?.qty || 1);

    if (!Number.isInteger(itemId) || itemId <= 0 || !ORDERABLE_TABLES[type] || !Number.isInteger(qty) || qty <= 0) {
      throw new Error('Each item must have a valid id, type (product|kit|service), and qty > 0.');
    }

    const key = `${type}:${itemId}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += qty;
    } else {
      merged.set(key, { item_id: itemId, type, qty });
    }
  });

  const validated = [];

  for (const item of merged.values()) {
    const tableName = ORDERABLE_TABLES[item.type];
    const result = await client.query(
      `SELECT id, name, price, COALESCE(stock, 0) AS stock, COALESCE(is_out_of_stock, false) AS is_out_of_stock FROM ${tableName} WHERE id = $1 LIMIT 1;`,
      [item.item_id]
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error(`Item not found for ${item.type} #${item.item_id}.`);
    }

    if (item.type !== 'service' && (row.is_out_of_stock || Number(row.stock) < item.qty)) {
      throw new Error(`${row.name} is out of stock.`);
    }

    validated.push({
      ...item,
      name: row.name,
      price: Number(row.price),
      stock: Number(row.stock || 0)
    });
  }

  return validated;
}

async function createOrder(req, res) {
  const client = await pool.connect();

  try {
    const legacyKitId = Number(req.body?.kit_id);
    const submittedItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (Number.isInteger(legacyKitId) && legacyKitId > 0 && submittedItems.length === 0) {
      submittedItems.push({ id: legacyKitId, type: 'kit', qty: 1 });
    }

    await client.query('BEGIN');
    const currency = await getCurrency(client);
    const items = await normalizeOrderItems(submittedItems, client);
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

    const orderResult = await client.query(
      `
      INSERT INTO orders (user_id, status, total, currency)
      VALUES ($1, 'placed', $2, $3)
      RETURNING id, user_id, status, total, currency, created_at;
      `,
      [req.user.id, total, currency]
    );

    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `
        INSERT INTO order_items (order_id, item_id, type, qty, price)
        VALUES ($1, $2, $3, $4, $5);
        `,
        [order.id, item.item_id, item.type, item.qty, item.price]
      );

      if (item.type === 'product' || item.type === 'kit') {
        const tableName = ORDERABLE_TABLES[item.type];
        await client.query(
          `
          UPDATE ${tableName}
          SET stock = GREATEST(stock - $2, 0)
          WHERE id = $1;
          `,
          [item.item_id, item.qty]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      order,
      items: items.map((item) => ({
        item_id: item.item_id,
        type: item.type,
        qty: item.qty,
        price: item.price,
        name: item.name
      }))
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[POST /orders] Failed:', error.message);

    if (error.message.includes('required') || error.message.includes('valid') || error.message.includes('not found')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    return res.status(500).json({ success: false, error: 'Failed to place order.' });
  } finally {
    client.release();
  }
}

async function listMyOrders(req, res) {
  try {
    const result = await query(
      `
      SELECT
        o.id,
        o.user_id,
        o.status,
        o.total,
        o.currency,
        o.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'item_id', oi.item_id,
              'type', oi.type,
              'qty', oi.qty,
              'price', oi.price,
              'name', COALESCE(p.name, k.name, s.name, 'Item')
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON oi.type = 'product' AND p.id = oi.item_id
      LEFT JOIN kits k ON oi.type = 'kit' AND k.id = oi.item_id
      LEFT JOIN services s ON oi.type = 'service' AND s.id = oi.item_id
      WHERE o.user_id = $1
      GROUP BY o.id
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
        o.status,
        o.total,
        o.currency,
        o.created_at,
        u.name AS customer_name,
        u.email AS customer_email,
        u.contact_number AS customer_contact_number,
        u.address AS customer_address,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'item_id', oi.item_id,
              'type', oi.type,
              'qty', oi.qty,
              'price', oi.price,
              'name', COALESCE(p.name, k.name, s.name, 'Item')
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON oi.type = 'product' AND p.id = oi.item_id
      LEFT JOIN kits k ON oi.type = 'kit' AND k.id = oi.item_id
      LEFT JOIN services s ON oi.type = 'service' AND s.id = oi.item_id
      GROUP BY o.id, u.id
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
