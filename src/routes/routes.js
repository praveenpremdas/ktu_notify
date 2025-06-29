const express = require('express');
const router = express.Router();
const telegramConfigController = require('../controllers/telegramConfigController');
const logConfigController = require('../controllers/logConfigController');
const usercontroller = require('../controllers/usercontroller');

router.post('/updateTelegramConfig', telegramConfigController.updateConfig);
router.get('/getTelegramConfigs', telegramConfigController.getAllConfigs);
router.delete('/deleteTelegramConfig/:configKey', telegramConfigController.deleteTelegramConfig);

router.post('/updateLogConfig', logConfigController.updateLogConfig);
router.get('/getLogConfig', logConfigController.getLogConfig); 

router.post('/createpassword',usercontroller.savePasswordDetails); 

router.post('/login', usercontroller.loginUser);


module.exports = router;
