const express = require('express');
const router = express.Router();
const deviceApiController = require('../controllers/deviceApiController');

// ESP32 endpoints
router.get('/config/:macAddress', deviceApiController.getDeviceConfig);
router.post('/state/:macAddress', deviceApiController.updateDeviceStatus);
router.post('/command/:macAddress', deviceApiController.sendCommand);

module.exports = router;
