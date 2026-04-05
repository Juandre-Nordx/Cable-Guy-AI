const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const OLLAMA_API_URL = 'https://ollama-production-bc2b.up.railway.app/api/chat';
const OLLAMA_MODEL = 'phi3.5:latest';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 12000);
const MAX_USER_MESSAGE_LENGTH = Number(process.env.MAX_USER_MESSAGE_LENGTH || 2000);
const MAX_AI_REPLY_LENGTH = Number(process.env.MAX_AI_REPLY_LENGTH || 2500);

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
(Home WiFi Kit / Bridge Kit / Business Kit)

NOTES:
...`;

app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

function trimToMaxLength(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function extractAssistantText(ollamaPayload) {
  const content = ollamaPayload?.message?.content;
  if (typeof content !== 'string') {
    return '';
  }

  return content.trim();
}

function detectRecommendedKit(aiReply) {
  const normalizedReply = aiReply.toLowerCase();

  if (normalizedReply.includes('bridge')) {
    return 'Wireless Bridge Kit';
  }

  if (normalizedReply.includes('home wifi')) {
    return 'Home WiFi Kit';
  }

  if (normalizedReply.includes('business')) {
    return 'Business Kit';
  }

  return 'Home WiFi Kit';
}

async function callOllama(userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const requestBody = {
      model: OLLAMA_MODEL,
      stream: false,
      options: {
        num_predict: 200
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ]
    };

    console.log('[POST /chat] Sending request to Ollama', {
      model: requestBody.model,
      stream: requestBody.stream,
      num_predict: requestBody.options.num_predict
    });

    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API failed (${response.status}): ${trimToMaxLength(errorText, 500)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post('/chat', async (req, res) => {
  try {
    const message = req.body?.message;

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'A non-empty "message" string is required.'
      });
    }

    const sanitizedMessage = trimToMaxLength(message.trim(), MAX_USER_MESSAGE_LENGTH);
    console.log('[POST /chat] Incoming message length:', sanitizedMessage.length);

    const ollamaPayload = await callOllama(sanitizedMessage);
    const aiReplyRaw = extractAssistantText(ollamaPayload);

    if (!aiReplyRaw) {
      console.error('[POST /chat] Empty response payload from Ollama:', {
        hasMessage: Boolean(ollamaPayload?.message),
        done: ollamaPayload?.done
      });

      return res.status(502).json({
        success: false,
        error: 'The AI service returned an empty response.'
      });
    }

    const reply = trimToMaxLength(aiReplyRaw, MAX_AI_REPLY_LENGTH);
    const recommendedKit = detectRecommendedKit(reply);

    return res.json({
      success: true,
      reply,
      recommendedKit
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('[POST /chat] Ollama timeout:', error.message);
      return res.status(504).json({
        success: false,
        error: `AI request timed out after ${OLLAMA_TIMEOUT_MS}ms.`
      });
    }

    console.error('[POST /chat] Chat failed:', error.message);
    return res.status(502).json({
      success: false,
      error: 'Failed to get a response from the AI service.'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Cable Guy AI server running on port ${PORT}`);
});
