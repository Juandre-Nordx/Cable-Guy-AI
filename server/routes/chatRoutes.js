const router = require('express').Router();
const { chat, wizard } = require('../controllers/chatController');

router.post('/wizard', wizard);
router.post('/', chat);

module.exports = router;
