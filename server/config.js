const path = require('path');

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  port: toNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  ollamaApiUrl: process.env.OLLAMA_API_URL || 'https://ollama-production-bc2b.up.railway.app/api/chat',
  ollamaModel: process.env.OLLAMA_MODEL || 'phi3.5:latest',
  ollamaTimeoutMs: toNumber(process.env.OLLAMA_TIMEOUT_MS, 45000),
  maxUserMessageLength: toNumber(process.env.MAX_USER_MESSAGE_LENGTH, 2000),
  maxAiReplyLength: toNumber(process.env.MAX_AI_REPLY_LENGTH, 2500),
  uploadDir: process.env.UPLOAD_DIR || '/uploads',
  uploadUrlBase: process.env.UPLOAD_URL_BASE || '/uploads',
  clientDir: path.join(__dirname, '..', 'client'),
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || '',
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || ''
};
