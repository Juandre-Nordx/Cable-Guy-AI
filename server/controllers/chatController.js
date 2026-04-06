const config = require('../config');
const { query } = require('../models/db');
const {
  trimToMaxLength,
  extractAssistantText,
  detectNeedsTechnician,
  detectRecommendedKit
} = require('../utils/ai');

const systemPrompt = `You are Cable Guy AI, a professional network technician.

You must:
- Ask 3–5 diagnostic questions before giving a solution
- Focus on real-world networking issues (WiFi coverage, distance, walls, ISP setup)

After understanding the problem, respond in this format:

PROBLEM:
...

SOLUTION:
...

RECOMMENDED KIT:
(Home WiFi Kit / Bridge Kit / CCTV Kit / Business Network Kit / None)

TECHNICIAN:
(Yes/No)

NOTES:
...`;

async function callOllama(userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.ollamaTimeoutMs);

  try {
    const response = await fetch(config.ollamaApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        options: { num_predict: 260 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API failed (${response.status}): ${trimToMaxLength(errText, 500)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function wizardTree(_req, res) {
  try {
    const [nodesResult, edgesResult] = await Promise.all([
      query(
        `
        SELECT id, title, type, message, category, needs_technician, recommended_items
        FROM wizard_nodes
        ORDER BY id ASC;
        `
      ),
      query(
        `
        SELECT id, from_node_id, to_node_id, label
        FROM wizard_edges
        ORDER BY id ASC;
        `
      )
    ]);

    const incoming = new Set(edgesResult.rows.map((edge) => edge.to_node_id));
    const rootNodes = nodesResult.rows.filter((node) => !incoming.has(node.id));

    if (!nodesResult.rows.length || !rootNodes.length) {
      return res.status(409).json({
        success: false,
        error: 'Wizard tree is not configured correctly. Please define at least one root node.'
      });
    }

    const allNodes = nodesResult.rows;
    const recommendedByType = allNodes.reduce(
      (acc, node) => {
        const items = Array.isArray(node.recommended_items) ? node.recommended_items : [];
        for (const item of items) {
          if (!item || !Number.isInteger(Number(item.id))) continue;
          if (item.type === 'product') acc.products.add(Number(item.id));
          if (item.type === 'kit') acc.kits.add(Number(item.id));
          if (item.type === 'service') acc.services.add(Number(item.id));
        }
        return acc;
      },
      { products: new Set(), kits: new Set(), services: new Set() }
    );

    const [productsResult, kitsResult, servicesResult] = await Promise.all([
      recommendedByType.products.size
        ? query('SELECT id, name, price, image_url, category FROM products WHERE id = ANY($1::int[]);', [[...recommendedByType.products]])
        : { rows: [] },
      recommendedByType.kits.size
        ? query('SELECT id, name, price, image_url, category FROM kits WHERE id = ANY($1::int[]);', [[...recommendedByType.kits]])
        : { rows: [] },
      recommendedByType.services.size
        ? query('SELECT id, name, price, NULL::text AS image_url, NULL::text AS category FROM services WHERE id = ANY($1::int[]);', [[...recommendedByType.services]])
        : { rows: [] }
    ]);

    const productMap = new Map(productsResult.rows.map((item) => [item.id, item]));
    const kitMap = new Map(kitsResult.rows.map((item) => [item.id, item]));
    const serviceMap = new Map(servicesResult.rows.map((item) => [item.id, item]));

    const nodes = allNodes.map((node) => {
      const recommendedItems = (Array.isArray(node.recommended_items) ? node.recommended_items : [])
        .map((item) => {
          const normalizedId = Number(item?.id);
          if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
          if (item.type === 'product') return { type: 'product', ...productMap.get(normalizedId) };
          if (item.type === 'kit') return { type: 'kit', ...kitMap.get(normalizedId) };
          if (item.type === 'service') return { type: 'service', ...serviceMap.get(normalizedId) };
          return null;
        })
        .filter((item) => item && item.id);

      return {
        ...node,
        recommended_items: recommendedItems,
        recommendedItems
      };
    });

    return res.json({
      success: true,
      rootNodeId: rootNodes[0].id,
      nodes,
      edges: edgesResult.rows
    });
  } catch (error) {
    console.error('[GET /chat/wizard/tree] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load wizard tree.' });
  }
}

async function chat(req, res) {
  try {
    const message = req.body?.message;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'A non-empty message is required.' });
    }

    const sanitized = trimToMaxLength(message.trim(), config.maxUserMessageLength);
    const payload = await callOllama(sanitized);
    const aiReply = trimToMaxLength(extractAssistantText(payload), config.maxAiReplyLength);

    if (!aiReply) {
      return res.status(502).json({ success: false, error: 'The AI service returned an empty response.' });
    }

    const kitSignal = detectRecommendedKit(aiReply);
    const needsTechnician = detectNeedsTechnician(aiReply);
    const recommendedCategory = kitSignal?.recommendedCategory || null;

    let kit = null;
    if (recommendedCategory) {
      const result = await query('SELECT * FROM kits WHERE category = $1 LIMIT 1;', [recommendedCategory]);
      kit = result.rows[0] || null;
    }

    return res.json({
      success: true,
      reply: aiReply,
      kit,
      recommendedKit: kit,
      recommendedCategory,
      needsTechnician
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ success: false, error: `AI request timed out after ${config.ollamaTimeoutMs}ms.` });
    }
    console.error('[POST /chat] Failed:', error.message);
    return res.status(502).json({ success: false, error: 'Failed to get a response from the AI service.' });
  }
}

module.exports = { chat, wizardTree };
