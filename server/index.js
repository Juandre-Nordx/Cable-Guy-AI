const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const OLLAMA_CHAT_URL = process.env.OLLAMA_CHAT_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3.5:latest';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 25000);
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 30);

const systemPrompt = `You are Cable Guy AI, a professional network technician.

You must:
- Ask 3–5 diagnostic questions before giving a solution
- Focus on real-world networking issues

After understanding the problem, respond in this exact format:

PROBLEM:
...

SOLUTION:
...

RECOMMENDED KIT:
(Home WiFi Kit / Bridge Kit / Business Kit)

NOTES:
...`;

const conversationHistory = [{ role: 'system', content: systemPrompt }];

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

function limitConversationHistory(history) {
  if (history.length <= MAX_HISTORY_MESSAGES + 1) return;
  history.splice(1, history.length - (MAX_HISTORY_MESSAGES + 1));
}

function detectRecommendedKit(replyText) {
  const normalized = (replyText || '').toLowerCase();

  if (normalized.includes('bridge')) return 'Wireless Bridge Kit';
  if (normalized.includes('home wifi')) return 'Home WiFi Kit';
  if (normalized.includes('business')) return 'Business Kit';

  return null;
}

async function requestOllama(messages) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { num_predict: 200 },
        messages
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama API failure (${response.status}): ${errorBody}`);
    }

    const payload = await response.json();
    const reply = payload?.message?.content?.trim();

    if (!reply) {
      throw new Error('Ollama returned an empty response.');
    }

    return reply;
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post('/chat', async (req, res) => {
  const userMessage = req.body?.message;

  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    return res.status(400).json({
      success: false,
      error: 'A non-empty message string is required.'
    });
  }

  const trimmedMessage = userMessage.trim();
  conversationHistory.push({ role: 'user', content: trimmedMessage });

  try {
    console.log('[CableGuyAI] Sending request to Ollama', {
      model: OLLAMA_MODEL,
      messageLength: trimmedMessage.length,
      historySize: conversationHistory.length
    });

    const aiReply = await requestOllama(conversationHistory);
    conversationHistory.push({ role: 'assistant', content: aiReply });
    limitConversationHistory(conversationHistory);

    const recommendedKit = detectRecommendedKit(aiReply);

    return res.json({
      success: true,
      reply: aiReply,
      recommendedKit
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[CableGuyAI] Ollama timeout', { timeoutMs: OLLAMA_TIMEOUT_MS });
      return res.status(504).json({
        success: false,
        error: `Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms.`
      });
    }

    console.error('[CableGuyAI] Chat request failed', { error: error.message });
    return res.status(502).json({
      success: false,
      error: 'Unable to generate AI response. Verify Ollama is running and reachable.'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[CableGuyAI] Server running on port ${PORT}`);
});
