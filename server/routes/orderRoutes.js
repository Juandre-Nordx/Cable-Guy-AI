const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { createOrder, listMyOrders, listOrderNotes, createOrderNote } = require('../controllers/orderController');

router.use(authenticate);
router.post('/', createOrder);
router.get('/my', listMyOrders);
router.get('/:id/notes', listOrderNotes);
router.post('/:id/note', createOrderNote);

module.exports = router;
