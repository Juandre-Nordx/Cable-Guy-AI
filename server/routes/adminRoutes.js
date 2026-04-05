const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  createKit,
  dashboard,
  uploadImage
} = require('../controllers/adminController');
const { updateBookingStatus } = require('../controllers/bookingController');

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeOriginal}`);
  }
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return cb(new Error('Only jpg, jpeg, png, and webp files are allowed.'));
  }
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.use(authenticate, requireAdmin);

router.post('/product', createProduct);
router.put('/product/:id', updateProduct);
router.delete('/product/:id', deleteProduct);
router.post('/kit', createKit);
router.get('/dashboard', dashboard);
router.put('/booking/:id/status', updateBookingStatus);
router.post('/upload', upload.single('image'), uploadImage);

module.exports = router;
