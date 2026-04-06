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
        SELECT id, title, type, message, category, needs_technician
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

    return res.json({
      success: true,
      rootNodeId: rootNodes[0].id,
      nodes: nodesResult.rows,
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
