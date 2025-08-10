const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const deviceApiController = require('../controllers/deviceApiController');

// Device API endpoints (for ESP32 devices)
router.get('/config/:macAddress', deviceApiController.getDeviceConfig);
router.post('/state/:macAddress', deviceApiController.updateDeviceStatus);
router.get('/commands/:macAddress', deviceApiController.getDeviceCommands);
router.post('/command/:macAddress', auth, deviceApiController.sendCommand);

module.exports = router;
