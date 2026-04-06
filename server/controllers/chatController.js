const config = require('../config');
const { query } = require('../models/db');
const {
  trimToMaxLength,
  extractAssistantText,
  detectNeedsTechnician,
  detectRecommendedKit
} = require('../utils/ai');

const WIZARD_PROBLEMS = ['wifi_coverage', 'slow_internet', 'between_buildings', 'security', 'other'];
const WIZARD_PROPERTY_TYPES = ['small_home', 'large_home', 'office', 'multiple_buildings'];
const WIZARD_DISTANCES = ['same_room', 'different_rooms', 'separate_building'];

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

function mapWizardRecommendation({ problem, property_type, distance, self_install }) {
  let recommendedCategory = 'home';

  if (problem === 'security') {
    recommendedCategory = 'security';
  } else if (distance === 'separate_building' || property_type === 'multiple_buildings' || problem === 'between_buildings') {
    recommendedCategory = 'bridge';
  } else if (property_type === 'office') {
    recommendedCategory = 'business';
  }

  const complexSetup =
    recommendedCategory === 'bridge' ||
    recommendedCategory === 'business' ||
    property_type === 'large_home' ||
    distance === 'separate_building';

  const needsTechnician = !self_install || complexSetup;

  const reasons = [];
  if (recommendedCategory === 'bridge') reasons.push('long-distance or separate-building connectivity');
  if (recommendedCategory === 'security') reasons.push('security monitoring needs');
  if (recommendedCategory === 'business') reasons.push('office-grade network capacity');
  if (recommendedCategory === 'home') reasons.push('home WiFi coverage optimization');

  return {
    recommendedCategory,
    needsTechnician,
    message: `Based on your answers, we recommend the ${recommendedCategory} kit for ${reasons[0]}.`
  };
}

async function wizard(req, res) {
  try {
    const { problem, property_type, distance, self_install } = req.body || {};

    if (
      !WIZARD_PROBLEMS.includes(problem) ||
      !WIZARD_PROPERTY_TYPES.includes(property_type) ||
      !WIZARD_DISTANCES.includes(distance) ||
      typeof self_install !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        error: 'problem, property_type, distance, and self_install are required with valid values.'
      });
    }

    const recommendation = mapWizardRecommendation({ problem, property_type, distance, self_install });
    return res.json({ success: true, ...recommendation });
  } catch (error) {
    console.error('[POST /chat/wizard] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to evaluate wizard answers.' });
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

module.exports = { chat, wizard };
