const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  getSettings,
  updateSettings
} = require('../controllers/settingsController');

// General settings routes
router.get('/', auth, getSettings);
router.put('/', auth, updateSettings);

// Settings routes

module.exports = router;
