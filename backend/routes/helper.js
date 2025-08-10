const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const { logger } = require('../middleware/logger');

// Get system status
router.get('/status', auth, authorize('admin'), async (req, res) => {
    try {
        const status = {
            devices: {
                total: await Device.countDocuments(),
                online: await Device.countDocuments({ status: 'online' }),
                offline: await Device.countDocuments({ status: 'offline' })
            },
            activities: {
                last24h: await ActivityLog.countDocuments({
                    createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
                }),
                lastWeek: await ActivityLog.countDocuments({
                    createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
                })
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date()
            }
        };
        res.json(status);
    } catch (error) {
        logger.error('Status check failed:', error);
        res.status(500).json({
            error: 'Failed to get system status',
            message: error.message
        });
    }
});

// Get device statistics
router.get('/devices/stats', auth, async (req, res) => {
    try {
        const stats = await Device.aggregate([
            {
                $group: {
                    _id: '$location',
                    count: { $sum: 1 },
                    onlineCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] }
                    },
                    offlineCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'offline'] }, 1, 0] }
                    }
                }
            }
        ]);
        res.json(stats);
    } catch (error) {
        logger.error('Device stats failed:', error);
        res.status(500).json({
            error: 'Failed to get device statistics',
            message: error.message
        });
    }
});

// Get activity summary
router.get('/activities/summary', auth, async (req, res) => {
    try {
        const summary = await ActivityLog.aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                    actions: { $addToSet: '$action' }
                }
            },
            { $sort: { _id: -1 } }
        ]);
        res.json(summary);
    } catch (error) {
        logger.error('Activity summary failed:', error);
        res.status(500).json({
            error: 'Failed to get activity summary',
            message: error.message
        });
    }
});

// Validate device configuration
router.post('/validate/device', auth, async (req, res) => {
    try {
        const { macAddress, switches } = req.body;
        const validationResults = {
            macAddress: {
                valid: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(macAddress),
                exists: await Device.exists({ macAddress })
            },
            switches: switches.map(sw => ({
                gpio: sw.gpio,
                valid: sw.gpio >= 0 && sw.gpio <= 39 && ![6,7,8,9,10,11].includes(sw.gpio),
                conflicts: switches.filter(s => s.gpio === sw.gpio).length > 1
            }))
        };
        res.json(validationResults);
    } catch (error) {
        logger.error('Configuration validation failed:', error);
        res.status(500).json({
            error: 'Validation failed',
            message: error.message
        });
    }
});

module.exports = router;
