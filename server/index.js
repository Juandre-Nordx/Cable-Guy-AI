const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'https://ollama-production-bc2b.up.railway.app/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi3.5:latest';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
const MAX_USER_MESSAGE_LENGTH = Number(process.env.MAX_USER_MESSAGE_LENGTH || 2000);
const MAX_AI_REPLY_LENGTH = Number(process.env.MAX_AI_REPLY_LENGTH || 2500);

const DATABASE_URL = process.env.DATABASE_URL;
const DEFAULT_KITS = [
  {
    name: 'Home WiFi Kit',
    type: 'home',
    description: 'Dual-node mesh kit for apartments and homes with dead zones.',
    price: 199.99,
    difficulty: 'easy'
  },
  {
    name: 'Bridge Kit',
    type: 'bridge',
    description: 'Point-to-point bridge kit to connect detached buildings or garages.',
    price: 299.0,
    difficulty: 'medium'
  },
  {
    name: 'Business Network Kit',
    type: 'business',
    description: 'Router + managed switch + access points for multi-user environments.',
    price: 549.0,
    difficulty: 'medium'
  }
];

const fallbackDb = {
  kits: DEFAULT_KITS.map((kit, index) => ({ id: index + 1, ...kit })),
  bookings: []
};

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    })
  : null;

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
(Home WiFi Kit / Bridge Kit / Business Network Kit / None)

TECHNICIAN:
(Yes/No)

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

function detectRecommendedKit(aiReply = '') {
  const normalizedReply = aiReply.toLowerCase();

  if (normalizedReply.includes('bridge kit') || normalizedReply.includes('wireless bridge')) {
    return { name: 'Bridge Kit', type: 'bridge' };
  }

  if (normalizedReply.includes('business network kit') || normalizedReply.includes('business kit')) {
    return { name: 'Business Network Kit', type: 'business' };
  }

  if (normalizedReply.includes('home wifi kit') || normalizedReply.includes('home wi-fi kit')) {
    return { name: 'Home WiFi Kit', type: 'home' };
  }

  return null;
}

function detectNeedsTechnician(aiReply = '') {
  const normalizedReply = aiReply.toLowerCase();
  return (
    normalizedReply.includes('technician: yes') ||
    normalizedReply.includes('technician recommended') ||
    normalizedReply.includes('book a technician')
  );
}

async function dbQuery(text, params = []) {
  if (!pool) {
    throw new Error('PostgreSQL is not configured. Set DATABASE_URL to enable DB operations.');
  }
  return pool.query(text, params);
}

async function initializeDatabase() {
  if (!pool) {
    console.warn('[DB] DATABASE_URL not configured. Running in in-memory fallback mode.');
    return;
  }

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS kits (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium'))
    );
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      kit_id INTEGER REFERENCES kits(id),
      status TEXT NOT NULL DEFAULT 'pending'
    );
  `);

  for (const kit of DEFAULT_KITS) {
    await dbQuery(
      `
      INSERT INTO kits(name, type, description, price, difficulty)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(type) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          difficulty = EXCLUDED.difficulty;
    `,
      [kit.name, kit.type, kit.description, kit.price, kit.difficulty]
    );
  }

  console.log('[DB] Schema ensured and kits seeded.');
}

async function getKits() {
  if (!pool) {
    return fallbackDb.kits;
  }

  const result = await dbQuery('SELECT id, name, type, description, price, difficulty FROM kits ORDER BY id ASC;');
  return result.rows;
}

async function saveBooking({ name, phone, address, kit_id }) {
  if (!pool) {
    const id = fallbackDb.bookings.length + 1;
    const booking = { id, name, phone, address, kit_id, status: 'pending' };
    fallbackDb.bookings.push(booking);
    return booking;
  }

  const result = await dbQuery(
    `
      INSERT INTO bookings(name, phone, address, kit_id, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, name, phone, address, kit_id, status;
    `,
    [name, phone, address, kit_id]
  );

  return result.rows[0];
}

async function findKitByType(type) {
  const kits = await getKits();
  return kits.find((kit) => kit.type === type) || null;
}

async function callOllama(userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const requestBody = {
      model: OLLAMA_MODEL,
      stream: false,
      options: {
        num_predict: 260
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

app.get('/kits', async (req, res) => {
  try {
    const kits = await getKits();
    console.log('[GET /kits] Returning kit count:', kits.length);
    return res.json({ success: true, kits });
  } catch (error) {
    console.error('[GET /kits] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load kits.' });
  }
});

app.post('/book', async (req, res) => {
  try {
    const { name, phone, address, kit_id } = req.body || {};

    if (!name || !phone || !address) {
      return res.status(400).json({
        success: false,
        error: 'name, phone, and address are required.'
      });
    }

    const booking = await saveBooking({
      name: String(name).trim(),
      phone: String(phone).trim(),
      address: String(address).trim(),
      kit_id: kit_id ? Number(kit_id) : null
    });

    console.log('[POST /book] Booking created:', booking.id);
    return res.status(201).json({ success: true, booking });
  } catch (error) {
    console.error('[POST /book] Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create booking.' });
  }
});

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
    const kitSignal = detectRecommendedKit(reply);
    const needsTechnician = detectNeedsTechnician(reply);

    let recommendedKit = null;
    if (kitSignal?.type) {
      recommendedKit = await findKitByType(kitSignal.type);
      if (!recommendedKit) {
        recommendedKit = {
          id: null,
          name: kitSignal.name,
          type: kitSignal.type,
          description: 'Recommended by AI. See store for full details.',
          price: null,
          difficulty: 'easy'
        };
      }
    }

    return res.json({
      success: true,
      reply,
      recommendedKit,
      needsTechnician
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

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Cable Guy AI server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[Startup] Failed to initialize database:', error.message);
    process.exit(1);
  });
