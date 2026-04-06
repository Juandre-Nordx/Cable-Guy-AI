const { query } = require('../models/db');
const { requiredString, validateEnum, validateNumber } = require('../middleware/validate');
const { ORDER_STATUSES } = require('./orderController');

const KIT_CATEGORIES = ['home', 'bridge', 'backup', 'security', 'infrastructure', 'business', 'smart'];
const WIZARD_NODE_TYPES = ['question', 'result'];
const ALLOWED_CURRENCIES = ['ZAR', 'USD', 'EUR'];

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
    const { name, category, price, difficulty, requires_technician, description, instructions, image_url, video_url } = req.body || {};

    if (
      !requiredString(name) ||
      !validateEnum(category, KIT_CATEGORIES) ||
      !validateNumber(price) ||
      !requiredString(difficulty) ||
      typeof requires_technician !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        error: 'name, valid category, price, difficulty, and requires_technician are required.'
      });
    }

    const result = await query(
      `
      INSERT INTO kits (name, category, price, difficulty, requires_technician, description, instructions, image_url, video_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
      `,
      [
        name.trim(),
        category,
        price,
        difficulty.trim(),
        requires_technician,
        description?.trim() || '',
        instructions?.trim() || '',
        image_url?.trim() || null,
        video_url?.trim() || null
      ]
    );

    return res.status(201).json({ success: true, kit: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Kit category already exists.' });
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

async function getAdminSettings(_req, res) {
  try {
    const currencyResult = await query(
      `
      SELECT value
      FROM settings
      WHERE key = 'currency'
      LIMIT 1;
      `
    );

    const currency = currencyResult.rows[0]?.value || 'ZAR';
    return res.json({ success: true, settings: { currency } });
  } catch (error) {
    console.error('[GET /admin/settings] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load settings.' });
  }
}

async function updateAdminSettings(req, res) {
  try {
    const rawCurrency = req.body?.currency;
    const currency = requiredString(rawCurrency) ? rawCurrency.trim().toUpperCase() : '';

    if (!validateEnum(currency, ALLOWED_CURRENCIES)) {
      return res.status(400).json({
        success: false,
        error: `Valid currency is required (${ALLOWED_CURRENCIES.join(', ')}).`
      });
    }

    await query(
      `
      INSERT INTO settings (key, value)
      VALUES ('currency', $1)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value;
      `,
      [currency]
    );

    return res.json({ success: true, message: 'System settings updated.', settings: { currency } });
  } catch (error) {
    console.error('[PUT /admin/settings] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update settings.' });
  }
}

async function listWizardNodes(_req, res) {
  try {
    const result = await query(
      `
      SELECT id, title, type, message, category, needs_technician, created_at
      FROM wizard_nodes
      ORDER BY id ASC;
      `
    );

    return res.json({ success: true, nodes: result.rows });
  } catch (error) {
    console.error('[GET /admin/wizard/nodes] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load wizard nodes.' });
  }
}

async function listWizardEdges(_req, res) {
  try {
    const nodeId = Number(_req.query?.node_id);
    const hasNodeFilter = Number.isInteger(nodeId) && nodeId > 0;
    const result = await query(
      `
      SELECT id, from_node_id, to_node_id, label, created_at
      FROM wizard_edges
      ${hasNodeFilter ? 'WHERE from_node_id = $1' : ''}
      ORDER BY from_node_id ASC, id ASC;
      `
      ,
      hasNodeFilter ? [nodeId] : []
    );

    return res.json({ success: true, edges: result.rows });
  } catch (error) {
    console.error('[GET /admin/wizard/edges] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load wizard edges.' });
  }
}

function sanitizeWizardNodeInput(payload = {}) {
  const title = requiredString(payload.title) ? payload.title.trim() : '';
  const type = payload.type;
  const message = requiredString(payload.message) ? payload.message.trim() : '';
  const category = requiredString(payload.category) ? payload.category.trim() : null;
  const needsTechnician = Boolean(payload.needs_technician);
  return { title, type, message, category, needsTechnician };
}

async function countRootNodes() {
  const result = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM wizard_nodes wn
    LEFT JOIN wizard_edges we ON we.to_node_id = wn.id
    WHERE we.id IS NULL;
    `
  );

  return result.rows[0]?.count || 0;
}

async function createWizardNode(req, res) {
  try {
    const { title, type, message, category, needsTechnician } = sanitizeWizardNodeInput(req.body);

    if (!requiredString(title) || !validateEnum(type, WIZARD_NODE_TYPES)) {
      return res.status(400).json({ success: false, error: 'title and valid type are required.' });
    }

    if (type === 'result' && !requiredString(message)) {
      return res.status(400).json({ success: false, error: 'message is required for result nodes.' });
    }

    const result = await query(
      `
      INSERT INTO wizard_nodes (title, type, message, category, needs_technician)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, title, type, message, category, needs_technician, created_at;
      `,
      [title, type, type === 'result' ? message : '', category, needsTechnician]
    );

    return res.status(201).json({ success: true, node: result.rows[0] });
  } catch (error) {
    console.error('[POST /admin/wizard/node] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create wizard node.' });
  }
}

async function updateWizardNode(req, res) {
  try {
    const id = Number(req.params.id);
    const { title, type, message, category, needsTechnician } = sanitizeWizardNodeInput(req.body);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid node id.' });
    }

    if (!requiredString(title) || !validateEnum(type, WIZARD_NODE_TYPES)) {
      return res.status(400).json({ success: false, error: 'title and valid type are required.' });
    }

    if (type === 'result' && !requiredString(message)) {
      return res.status(400).json({ success: false, error: 'message is required for result nodes.' });
    }

    const result = await query(
      `
      UPDATE wizard_nodes
      SET title = $2,
          type = $3,
          message = $4,
          category = $5,
          needs_technician = $6
      WHERE id = $1
      RETURNING id, title, type, message, category, needs_technician, created_at;
      `,
      [id, title, type, type === 'result' ? message : '', category, needsTechnician]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Wizard node not found.' });
    }

    return res.json({ success: true, node: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/wizard/node/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update wizard node.' });
  }
}

async function deleteWizardNode(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid node id.' });
    }

    const totalNodesResult = await query('SELECT COUNT(*)::int AS count FROM wizard_nodes;');
    if ((totalNodesResult.rows[0]?.count || 0) <= 1) {
      return res.status(400).json({ success: false, error: 'Wizard must contain at least one root node.' });
    }

    const result = await query('DELETE FROM wizard_nodes WHERE id = $1 RETURNING id;', [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Wizard node not found.' });
    }

    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('[DELETE /admin/wizard/node/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete wizard node.' });
  }
}

async function hasPathBetweenNodes(fromNodeId, toNodeId) {
  const result = await query(
    `
    WITH RECURSIVE walk AS (
      SELECT $1::int AS node_id
      UNION
      SELECT we.to_node_id
      FROM wizard_edges we
      JOIN walk w ON we.from_node_id = w.node_id
    )
    SELECT EXISTS (
      SELECT 1 FROM walk WHERE node_id = $2
    ) AS has_path;
    `,
    [fromNodeId, toNodeId]
  );

  return result.rows[0]?.has_path === true;
}

async function createWizardEdge(req, res) {
  try {
    const fromNodeId = Number(req.body?.from_node_id);
    const toNodeId = Number(req.body?.to_node_id);
    const label = req.body?.label?.toString().trim();

    if (!Number.isInteger(fromNodeId) || !Number.isInteger(toNodeId) || !requiredString(label)) {
      return res.status(400).json({ success: false, error: 'from_node_id, to_node_id, and label are required.' });
    }

    if (fromNodeId === toNodeId) {
      return res.status(400).json({ success: false, error: 'A node cannot connect to itself.' });
    }

    const nodeCheck = await query('SELECT id FROM wizard_nodes WHERE id = ANY($1::int[]);', [[fromNodeId, toNodeId]]);
    if (nodeCheck.rowCount !== 2) {
      return res.status(400).json({ success: false, error: 'Both source and target nodes must exist.' });
    }

    const hasCycle = await hasPathBetweenNodes(toNodeId, fromNodeId);
    if (hasCycle) {
      return res.status(400).json({ success: false, error: 'Connection creates a loop. Please choose another target.' });
    }

    const result = await query(
      `
      INSERT INTO wizard_edges (from_node_id, to_node_id, label)
      VALUES ($1, $2, $3)
      RETURNING id, from_node_id, to_node_id, label, created_at;
      `,
      [fromNodeId, toNodeId, label]
    );

    const rootCount = await countRootNodes();
    if (rootCount === 0) {
      await query('DELETE FROM wizard_edges WHERE id = $1;', [result.rows[0].id]);
      return res.status(409).json({ success: false, error: 'Wizard must always have at least one root node.' });
    }

    return res.status(201).json({ success: true, edge: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'This choice label already exists for the selected source node.' });
    }
    console.error('[POST /admin/wizard/edge] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create wizard edge.' });
  }
}

async function deleteWizardEdge(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid edge id.' });
    }

    const result = await query('DELETE FROM wizard_edges WHERE id = $1 RETURNING id;', [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Wizard edge not found.' });
    }

    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('[DELETE /admin/wizard/edge/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete wizard edge.' });
  }
}

async function updateWizardEdge(req, res) {
  try {
    const id = Number(req.params.id);
    const label = req.body?.label?.toString().trim();
    const toNodeId = Number(req.body?.to_node_id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid edge id.' });
    }

    if (!requiredString(label) || !Number.isInteger(toNodeId) || toNodeId <= 0) {
      return res.status(400).json({ success: false, error: 'label and valid to_node_id are required.' });
    }

    const edgeResult = await query('SELECT id, from_node_id FROM wizard_edges WHERE id = $1;', [id]);
    if (!edgeResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Wizard edge not found.' });
    }

    const fromNodeId = edgeResult.rows[0].from_node_id;
    if (fromNodeId === toNodeId) {
      return res.status(400).json({ success: false, error: 'A node cannot connect to itself.' });
    }

    const nodeCheck = await query('SELECT id FROM wizard_nodes WHERE id = ANY($1::int[]);', [[fromNodeId, toNodeId]]);
    if (nodeCheck.rowCount !== 2) {
      return res.status(400).json({ success: false, error: 'Both source and target nodes must exist.' });
    }

    const hasCycle = await hasPathBetweenNodes(toNodeId, fromNodeId);
    if (hasCycle) {
      return res.status(400).json({ success: false, error: 'Connection creates a loop. Please choose another target.' });
    }

    const result = await query(
      `
      UPDATE wizard_edges
      SET label = $2,
          to_node_id = $3
      WHERE id = $1
      RETURNING id, from_node_id, to_node_id, label, created_at;
      `,
      [id, label, toNodeId]
    );

    return res.json({ success: true, edge: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'This choice label already exists for the selected source node.' });
    }
    console.error('[PUT /admin/wizard/edge/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update wizard edge.' });
  }
}

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  createKit,
  createService,
  listUsers,
  dashboard,
  getAdminSettings,
  updateAdminSettings,
  uploadImage,
  listWizardNodes,
  createWizardNode,
  updateWizardNode,
  deleteWizardNode,
  listWizardEdges,
  createWizardEdge,
  deleteWizardEdge,
  updateWizardEdge
};
