const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { createBooking, listMyBookings } = require('../controllers/bookingController');

router.use(authenticate);
router.post('/', createBooking);
router.get('/', listMyBookings);

module.exports = router;
