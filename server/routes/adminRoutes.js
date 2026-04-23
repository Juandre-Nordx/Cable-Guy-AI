const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
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
} = require('../controllers/adminController');
const { listAllOrders, updateOrderStatus, createAdminOrderNote } = require('../controllers/orderController');

const UPLOAD_SUBDIRS = new Set(['products', 'kits', 'steps', 'services', 'common']);
for (const subdir of UPLOAD_SUBDIRS) {
  const targetDir = path.join(config.uploadDir, subdir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const requestedSubdir = String(req.params.type || req.body?.type || 'common').toLowerCase();
    const uploadSubdir = UPLOAD_SUBDIRS.has(requestedSubdir) ? requestedSubdir : 'common';
    const targetDir = path.join(config.uploadDir, uploadSubdir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomToken = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${randomToken}${ext}`);
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

router.get('/users', listUsers);
router.get('/orders', listAllOrders);
router.put('/orders/:id', updateOrderStatus);
router.post('/orders/:id/note', createAdminOrderNote);
router.get('/dashboard', dashboard);
router.get('/settings', getAdminSettings);
router.put('/settings', updateAdminSettings);

router.post('/product', createProduct);
router.put('/product/:id', updateProduct);
router.delete('/product/:id', deleteProduct);
router.post('/kit', createKit);
router.put('/kit/:id', updateKit);
router.delete('/kit/:id', deleteKit);
router.post('/service', createService);
router.put('/service/:id', updateService);
router.delete('/service/:id', deleteService);
router.get('/bookings', listTechBookings);
router.put('/bookings/:id', updateTechBooking);
router.post('/upload/:type', upload.single('image'), uploadImage);
router.get('/wizard/nodes', listWizardNodes);
router.post('/wizard/node', createWizardNode);
router.put('/wizard/node/:id', updateWizardNode);
router.delete('/wizard/node/:id', deleteWizardNode);
router.get('/wizard/edges', listWizardEdges);
router.post('/wizard/edge', createWizardEdge);
router.put('/wizard/edge/:id', updateWizardEdge);
router.delete('/wizard/edge/:id', deleteWizardEdge);

module.exports = router;
