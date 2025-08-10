const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const { auth } = require('../middleware/auth');

router.get('/auth-url', googleCalendarController.getAuthUrl);
router.get('/callback', auth, googleCalendarController.handleCallback);
router.get('/events', auth, googleCalendarController.getEvents);
router.get('/status', auth, googleCalendarController.getStatus);
router.post('/disconnect', auth, googleCalendarController.disconnect);

module.exports = router;
