const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const BulkOperations = require('../utils/bulkOperations');
const { logger } = require('../middleware/logger');

// Bulk create devices
router.post('/devices', auth, authorize('admin'), async (req, res) => {
    try {
        const results = await BulkOperations.bulkCreateDevices(req.body.devices, req.user.id);
        res.json({
            message: 'Bulk device creation completed',
            results
        });
    } catch (error) {
        logger.error('Bulk device creation failed:', error);
        res.status(500).json({
            error: 'Bulk operation failed',
            message: error.message
        });
    }
});

// Bulk create users
router.post('/users', auth, authorize('admin'), async (req, res) => {
    try {
        const results = await BulkOperations.bulkCreateUsers(req.body.users, req.user.id);
        res.json({
            message: 'Bulk user creation completed',
            results
        });
    } catch (error) {
        logger.error('Bulk user creation failed:', error);
        res.status(500).json({
            error: 'Bulk operation failed',
            message: error.message
        });
    }
});

// Bulk update devices
router.put('/devices', auth, authorize('admin'), async (req, res) => {
    try {
        const results = await BulkOperations.bulkUpdateDevices(req.body.updates);
        res.json({
            message: 'Bulk device update completed',
            results
        });
    } catch (error) {
        logger.error('Bulk device update failed:', error);
        res.status(500).json({
            error: 'Bulk operation failed',
            message: error.message
        });
    }
});

module.exports = router;
