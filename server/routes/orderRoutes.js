const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { createOrder, listMyOrders } = require('../controllers/orderController');

router.use(authenticate);
router.post('/', createOrder);
router.get('/my', listMyOrders);

module.exports = router;
