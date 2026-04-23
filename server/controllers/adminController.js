const { query, pool } = require('../models/db');
const { requiredString, validateEnum, validateNumber } = require('../middleware/validate');
const { ORDER_STATUSES } = require('./orderController');

const KIT_CATEGORIES = ['home', 'bridge', 'backup', 'security', 'infrastructure', 'business', 'smart'];
const WIZARD_NODE_TYPES = ['question', 'result'];
const ALLOWED_CURRENCIES = ['ZAR', 'USD', 'EUR'];
const RECOMMENDED_ITEM_TYPES = ['product', 'kit', 'service'];

function sanitizeImageUrls(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function normalizeUploadPath(input) {
  if (!requiredString(input)) return null;
  const raw = input.trim();
  if (raw.startsWith('/uploads/')) return raw;

  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/uploads/')) {
      return parsed.pathname;
    }
  } catch (_error) {
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}

function sanitizeKitSteps(input) {
  if (!Array.isArray(input)) return null;

  return input
    .map((step) => ({
      step_number: Number(step?.step_number),
      title: requiredString(step?.title) ? step.title.trim() : '',
      description: requiredString(step?.description) ? step.description.trim() : '',
      image: normalizeUploadPath(step?.image || step?.image_url)
    }))
    .filter((step) => Number.isInteger(step.step_number) && step.step_number > 0 && step.title)
    .sort((a, b) => a.step_number - b.step_number);
}

async function replaceKitSteps(client, kitId, steps) {
  await client.query('DELETE FROM kit_steps WHERE kit_id = $1;', [kitId]);
  if (!steps?.length) return;

  for (const step of steps) {
    await client.query(
      `
      INSERT INTO kit_steps (kit_id, step_number, title, description, image, image_url)
      VALUES ($1, $2, $3, $4, $5, $5);
      `,
      [kitId, step.step_number, step.title, step.description, step.image]
    );
  }
}

async function upsertProductGuide(client, productId, payload = {}) {
  const learnHow = requiredString(payload.learn_how) ? payload.learn_how.trim() : '';
  const installationGuide = requiredString(payload.installation_guide) ? payload.installation_guide.trim() : '';
  const videoUrl = requiredString(payload.video_url) ? payload.video_url.trim() : null;
  const hasContent = Boolean(learnHow || installationGuide || videoUrl);

  if (!hasContent) {
    await client.query('DELETE FROM guides WHERE product_id = $1;', [productId]);
    return null;
  }

  const result = await client.query(
    `
    INSERT INTO guides (product_id, learn_how, installation_guide, video_url)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (product_id)
    DO UPDATE SET
      learn_how = EXCLUDED.learn_how,
      installation_guide = EXCLUDED.installation_guide,
      video_url = EXCLUDED.video_url,
      updated_at = NOW()
    RETURNING *;
    `,
    [productId, learnHow, installationGuide, videoUrl]
  );

  return result.rows[0] || null;
}

async function createProduct(req, res) {
  try {
    const {
      name, category, price, cost, stock, is_out_of_stock, description, image_url, image_urls, main_image, learn_how, installation_guide, video_url
    } = req.body || {};

    if (!requiredString(name) || !requiredString(category) || !validateNumber(price) || !validateNumber(cost)) {
      return res.status(400).json({ success: false, error: 'name, category, price, and cost are required.' });
    }

    const normalizedImageUrls = sanitizeImageUrls(image_urls);
    const primaryImageUrl = normalizeUploadPath(main_image || image_url?.trim() || normalizedImageUrls[0] || null);

    const result = await query(
      `
      INSERT INTO products (name, category, price, cost, stock, is_out_of_stock, description, image_url, image_urls, main_image, category_id)
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10,
        (SELECT id FROM categories WHERE slug = LOWER($2) LIMIT 1)
      )
      RETURNING *;
      `,
      [
        name.trim(),
        category.trim(),
        price,
        cost,
        Number.isInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : 0,
        Boolean(is_out_of_stock),
        description?.trim() || '',
        primaryImageUrl,
        JSON.stringify(normalizedImageUrls),
        primaryImageUrl
      ]
    );

    const product = result.rows[0];
    const guide = await upsertProductGuide({ query }, product.id, { learn_how, installation_guide, video_url });
    return res.status(201).json({ success: true, product: { ...product, guide } });
  } catch (error) {
    console.error('[POST /admin/product] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create product.' });
  }
}

async function updateProduct(req, res) {
  try {
    const id = Number(req.params.id);
    const {
      name, category, price, cost, stock, is_out_of_stock, description, image_url, image_urls, main_image, learn_how, installation_guide, video_url
    } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid product id.' });
    }

    const normalizedImageUrls = sanitizeImageUrls(image_urls);
    const hasImageArray = Array.isArray(image_urls);
    const hasImageUrl = requiredString(image_url) || requiredString(main_image);
    const nextPrimaryImage = hasImageUrl ? normalizeUploadPath(main_image || image_url) : normalizedImageUrls[0] || null;

    const result = await query(
      `
      UPDATE products
      SET name = COALESCE($2, name),
          category = COALESCE($3, category),
          category_id = COALESCE((SELECT id FROM categories WHERE slug = LOWER($3) LIMIT 1), category_id),
          price = COALESCE($4, price),
          cost = COALESCE($5, cost),
          stock = COALESCE($6, stock),
          is_out_of_stock = COALESCE($7, is_out_of_stock),
          description = COALESCE($8, description),
          image_url = COALESCE($9, image_url),
          image_urls = COALESCE($10::jsonb, image_urls),
          main_image = COALESCE($11, main_image)
      WHERE id = $1
      RETURNING *;
      `,
      [
        id,
        requiredString(name) ? name.trim() : null,
        requiredString(category) ? category.trim() : null,
        validateNumber(price) ? price : null,
        validateNumber(cost) ? cost : null,
        Number.isInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : null,
        typeof is_out_of_stock === 'boolean' ? is_out_of_stock : null,
        requiredString(description) ? description.trim() : null,
        hasImageArray || hasImageUrl ? nextPrimaryImage : null,
        hasImageArray ? JSON.stringify(normalizedImageUrls) : null,
        hasImageArray || hasImageUrl ? nextPrimaryImage : null
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    const product = result.rows[0];
    const guide = await upsertProductGuide({ query }, product.id, { learn_how, installation_guide, video_url });
    return res.json({ success: true, product: { ...product, guide } });
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
    const {
      name, category, price, stock, is_out_of_stock, difficulty, requires_technician, description, instructions, image_url, main_image, video_url, steps
    } = req.body || {};

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

    const mainImage = normalizeUploadPath(main_image || image_url);
    const parsedSteps = sanitizeKitSteps(steps);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `
        INSERT INTO kits (name, category, price, stock, is_out_of_stock, difficulty, requires_technician, description, instructions, image_url, main_image, video_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)
        RETURNING *;
        `,
        [
          name.trim(),
          category,
          price,
          Number.isInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : 0,
          Boolean(is_out_of_stock),
          difficulty.trim(),
          requires_technician,
          description?.trim() || '',
          instructions?.trim() || '',
          mainImage,
          video_url?.trim() || null
        ]
      );
      const kit = result.rows[0];
      await replaceKitSteps(client, kit.id, parsedSteps);
      await client.query('COMMIT');
      return res.status(201).json({ success: true, kit });
    } catch (innerError) {
      await client.query('ROLLBACK');
      throw innerError;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Kit category already exists.' });
    }
    console.error('[POST /admin/kit] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create kit.' });
  }
}

async function updateKit(req, res) {
  try {
    const id = Number(req.params.id);
    const {
      name, category, price, stock, is_out_of_stock, difficulty, requires_technician, description, instructions, image_url, main_image, video_url, steps
    } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid kit id.' });
    }

    const parsedSteps = sanitizeKitSteps(steps);
    const hasSteps = Array.isArray(steps);
    const hasMainImage = requiredString(main_image) || requiredString(image_url);
    const mainImage = hasMainImage ? normalizeUploadPath(main_image || image_url) : null;

    const result = await query(
      `
      UPDATE kits
      SET name = COALESCE($2, name),
          category = COALESCE($3, category),
          price = COALESCE($4, price),
          stock = COALESCE($5, stock),
          is_out_of_stock = COALESCE($6, is_out_of_stock),
          difficulty = COALESCE($7, difficulty),
          requires_technician = COALESCE($8, requires_technician),
          description = COALESCE($9, description),
          instructions = COALESCE($10, instructions),
          image_url = COALESCE($11, image_url),
          main_image = COALESCE($11, main_image),
          video_url = COALESCE($12, video_url)
      WHERE id = $1
      RETURNING *;
      `,
      [
        id,
        requiredString(name) ? name.trim() : null,
        validateEnum(category, KIT_CATEGORIES) ? category : null,
        validateNumber(price) ? price : null,
        Number.isInteger(Number(stock)) && Number(stock) >= 0 ? Number(stock) : null,
        typeof is_out_of_stock === 'boolean' ? is_out_of_stock : null,
        requiredString(difficulty) ? difficulty.trim() : null,
        typeof requires_technician === 'boolean' ? requires_technician : null,
        requiredString(description) ? description.trim() : null,
        requiredString(instructions) ? instructions.trim() : null,
        hasMainImage ? mainImage : null,
        requiredString(video_url) ? video_url.trim() : null
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Kit not found.' });
    }

    const kit = result.rows[0];
    if (hasSteps) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await replaceKitSteps(client, kit.id, parsedSteps);
        await client.query('COMMIT');
      } catch (innerError) {
        await client.query('ROLLBACK');
        throw innerError;
      } finally {
        client.release();
      }
    }

    return res.json({ success: true, kit });
  } catch (error) {
    console.error('[PUT /admin/kit/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update kit.' });
  }
}

async function deleteKit(req, res) {
  try {
    const id = Number(req.params.id);
    const result = await query('DELETE FROM kits WHERE id = $1 RETURNING id;', [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Kit not found.' });
    }
    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('[DELETE /admin/kit/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete kit.' });
  }
}


async function createService(req, res) {
  try {
    const { name, description, price, image_url } = req.body || {};

    if (!requiredString(name) || !validateNumber(price)) {
      return res.status(400).json({ success: false, error: 'name and price are required.' });
    }

    const result = await query(
      `
      INSERT INTO services (name, description, price, image_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
      `,
      [name.trim(), description?.trim() || '', price, image_url?.trim() || null]
    );

    return res.status(201).json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('[POST /admin/service] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create service.' });
  }
}

async function updateService(req, res) {
  try {
    const id = Number(req.params.id);
    const { name, description, price, image_url } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid service id.' });
    }

    const result = await query(
      `
      UPDATE services
      SET name = COALESCE($2, name),
          description = COALESCE($3, description),
          price = COALESCE($4, price),
          image_url = COALESCE($5, image_url)
      WHERE id = $1
      RETURNING *;
      `,
      [
        id,
        requiredString(name) ? name.trim() : null,
        requiredString(description) ? description.trim() : null,
        validateNumber(price) ? price : null,
        requiredString(image_url) ? image_url.trim() : null
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    return res.json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/service/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update service.' });
  }
}

async function deleteService(req, res) {
  try {
    const id = Number(req.params.id);
    const result = await query('DELETE FROM services WHERE id = $1 RETURNING id;', [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }
    return res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('[DELETE /admin/service/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete service.' });
  }
}

async function listTechBookings(_req, res) {
  try {
    const result = await query(
      `
      SELECT id, client_name, contact, address, problem_description, status, assigned_technician, created_at
      FROM tech_bookings
      ORDER BY created_at DESC;
      `
    );
    return res.json({ success: true, bookings: result.rows });
  } catch (error) {
    console.error('[GET /admin/bookings] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load tech bookings.' });
  }
}

async function updateTechBooking(req, res) {
  try {
    const id = Number(req.params.id);
    const status = req.body?.status?.toString().trim();
    const assignedTechnician = req.body?.assigned_technician?.toString().trim();
    const allowedStatuses = ['pending', 'in_progress', 'completed'];

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid booking id.' });
    }

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid booking status.' });
    }

    const result = await query(
      `
      UPDATE tech_bookings
      SET status = COALESCE($2, status),
          assigned_technician = COALESCE($3, assigned_technician)
      WHERE id = $1
      RETURNING *;
      `,
      [id, status || null, assignedTechnician || null]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Tech booking not found.' });
    }

    return res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('[PUT /admin/bookings/:id] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update tech booking.' });
  }
}

async function listUsers(req, res) {
  try {
    const result = await query(
      `
      SELECT
        u.id,
        u.name,
        u.contact_number,
        u.email,
        u.address,
        u.role,
        u.created_at,
        COUNT(o.id)::int AS total_orders,
        COALESCE(SUM(o.total), 0)::numeric(10,2) AS lifetime_spend
      FROM users
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC;
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
    const [usersResult, ordersResult, ordersByStatusResult, revenueResult, activeUsersResult] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM users;'),
      query('SELECT COUNT(*)::int AS count FROM orders;'),
      query('SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status;'),
      query('SELECT COALESCE(SUM(total), 0)::numeric(10,2) AS revenue FROM orders;'),
      query("SELECT COUNT(DISTINCT user_id)::int AS count FROM orders WHERE created_at >= NOW() - INTERVAL '30 days';")
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
        orders_by_status: ordersByStatus,
        total_revenue: revenueResult.rows[0].revenue,
        active_users_30d: activeUsersResult.rows[0].count
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

  const uploadSubdir = req.params.type || 'common';
  const imageUrl = `/uploads/${uploadSubdir}/${req.file.filename}`;
  return res.status(201).json({ success: true, imageUrl, path: imageUrl });
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
      SELECT id, title, type, message, category, needs_technician, recommended_items, created_at
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
  const recommendedItems = sanitizeRecommendedItems(payload.recommended_items);
  return { title, type, message, category, needsTechnician, recommendedItems };
}

function sanitizeRecommendedItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const type = item?.type?.toString().trim().toLowerCase();
      const id = Number(item?.id);
      if (!validateEnum(type, RECOMMENDED_ITEM_TYPES) || !Number.isInteger(id) || id <= 0) {
        return null;
      }
      return { type, id };
    })
    .filter(Boolean)
    .filter((item, index, source) => source.findIndex((entry) => entry.type === item.type && entry.id === item.id) === index);
}

async function validateRecommendedItemsExist(items = []) {
  const idsByType = {
    product: items.filter((item) => item.type === 'product').map((item) => item.id),
    kit: items.filter((item) => item.type === 'kit').map((item) => item.id),
    service: items.filter((item) => item.type === 'service').map((item) => item.id)
  };

  const [productsResult, kitsResult, servicesResult] = await Promise.all([
    idsByType.product.length ? query('SELECT id FROM products WHERE id = ANY($1::int[]);', [idsByType.product]) : { rows: [] },
    idsByType.kit.length ? query('SELECT id FROM kits WHERE id = ANY($1::int[]);', [idsByType.kit]) : { rows: [] },
    idsByType.service.length ? query('SELECT id FROM services WHERE id = ANY($1::int[]);', [idsByType.service]) : { rows: [] }
  ]);

  const validProducts = new Set(productsResult.rows.map((row) => row.id));
  const validKits = new Set(kitsResult.rows.map((row) => row.id));
  const validServices = new Set(servicesResult.rows.map((row) => row.id));

  const missing = items.find((item) => {
    if (item.type === 'product') return !validProducts.has(item.id);
    if (item.type === 'kit') return !validKits.has(item.id);
    if (item.type === 'service') return !validServices.has(item.id);
    return true;
  });

  return { isValid: !missing, missing };
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
    const { title, type, message, category, needsTechnician, recommendedItems } = sanitizeWizardNodeInput(req.body);

    if (!requiredString(title) || !validateEnum(type, WIZARD_NODE_TYPES)) {
      return res.status(400).json({ success: false, error: 'title and valid type are required.' });
    }

    if (type === 'result' && !requiredString(message)) {
      return res.status(400).json({ success: false, error: 'message is required for result nodes.' });
    }

    const check = await validateRecommendedItemsExist(recommendedItems);
    if (!check.isValid) {
      return res.status(400).json({ success: false, error: `Recommended ${check.missing.type} #${check.missing.id} does not exist.` });
    }

    const result = await query(
      `
      INSERT INTO wizard_nodes (title, type, message, category, needs_technician, recommended_items)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING id, title, type, message, category, needs_technician, recommended_items, created_at;
      `,
      [title, type, type === 'result' ? message : '', category, needsTechnician, JSON.stringify(type === 'result' ? recommendedItems : [])]
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
    const { title, type, message, category, needsTechnician, recommendedItems } = sanitizeWizardNodeInput(req.body);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid node id.' });
    }

    if (!requiredString(title) || !validateEnum(type, WIZARD_NODE_TYPES)) {
      return res.status(400).json({ success: false, error: 'title and valid type are required.' });
    }

    if (type === 'result' && !requiredString(message)) {
      return res.status(400).json({ success: false, error: 'message is required for result nodes.' });
    }

    const check = await validateRecommendedItemsExist(recommendedItems);
    if (!check.isValid) {
      return res.status(400).json({ success: false, error: `Recommended ${check.missing.type} #${check.missing.id} does not exist.` });
    }

    const result = await query(
      `
      UPDATE wizard_nodes
      SET title = $2,
          type = $3,
          message = $4,
          category = $5,
          needs_technician = $6,
          recommended_items = $7::jsonb
      WHERE id = $1
      RETURNING id, title, type, message, category, needs_technician, recommended_items, created_at;
      `,
      [id, title, type, type === 'result' ? message : '', category, needsTechnician, JSON.stringify(type === 'result' ? recommendedItems : [])]
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
  updateKit,
  deleteKit,
  createService,
  updateService,
  deleteService,
  listTechBookings,
  updateTechBooking,
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
