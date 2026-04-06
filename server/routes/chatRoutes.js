const router = require('express').Router();
const { chat, wizardTree } = require('../controllers/chatController');

router.get('/wizard/tree', wizardTree);
router.post('/', chat);

module.exports = router;
