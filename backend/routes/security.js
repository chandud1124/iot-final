const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');

// Placeholder for security routes
router.get('/alerts', auth, (req, res) => {
  res.json([]);  // Return empty array for now
});

module.exports = router;
