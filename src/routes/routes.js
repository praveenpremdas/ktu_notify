const express = require('express');
const router = express.Router();
const telegramConfigController = require('../controllers/telegramConfigController');
const logConfigController = require('../controllers/logConfigController');

router.post('/updateTelegramConfig', telegramConfigController.updateConfig);
router.get('/getTelegramConfigs', telegramConfigController.getAllConfigs);

router.post('/updateLogConfig', logConfigController.updateLogConfig);
router.get('/getLogConfig', logConfigController.getLogConfig); 

module.exports = router;
