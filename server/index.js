const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { initializeDatabase } = require('./models/db');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const orderRoutes = require('./routes/orderRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const chatRoutes = require('./routes/chatRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app = express();

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '128kb' }));
app.use(config.uploadUrlBase, express.static(config.uploadDir));
app.use(express.static(config.clientDir));

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/orders', orderRoutes);
app.use('/bookings', bookingRoutes);
app.use('/chat', chatRoutes);
app.use('/ai', chatRoutes);
app.use('/', publicRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(config.clientDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error('[Unhandled Error]', error.message);
  return res.status(500).json({ success: false, error: 'Internal server error.' });
});

initializeDatabase()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Cable Guy AI server running on port ${config.port}`);
      console.log(`Uploads directory: ${config.uploadDir}`);
    });
  })
  .catch((error) => {
    console.error('[Startup] Failed to initialize database:', error.message);
    process.exit(1);
  });
