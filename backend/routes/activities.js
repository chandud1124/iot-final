
const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const ActivityLog = require('../models/ActivityLog');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Get activity logs
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, deviceId, userId, classroom, startDate, endDate } = req.query;
    
    let query = {};
    
    // Apply filters
    if (deviceId) query.deviceId = deviceId;
    if (userId) query.userId = userId;
    if (classroom) query.classroom = new RegExp(classroom, 'i');
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // Non-admin users can only see their assigned devices
    if (req.user.role !== 'admin') {
      query.deviceId = { $in: req.user.assignedDevices };
    }

    const activities = await ActivityLog.find(query)
      .populate('deviceId', 'name location classroom')
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await ActivityLog.countDocuments(query);

    res.json({
      success: true,
      data: activities,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get activity statistics
router.get('/stats', authorize('admin', 'security'), async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateFilter = new Date();
    switch (period) {
      case '24h':
        dateFilter.setHours(dateFilter.getHours() - 24);
        break;
      case '7d':
        dateFilter.setDate(dateFilter.getDate() - 7);
        break;
      case '30d':
        dateFilter.setDate(dateFilter.getDate() - 30);
        break;
      default:
        dateFilter.setDate(dateFilter.getDate() - 7);
    }

    const stats = await ActivityLog.aggregate([
      { $match: { timestamp: { $gte: dateFilter } } },
      {
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          onActions: { $sum: { $cond: [{ $eq: ['$action', 'on'] }, 1, 0] } },
          offActions: { $sum: { $cond: [{ $eq: ['$action', 'off'] }, 1, 0] } },
          userTriggered: { $sum: { $cond: [{ $eq: ['$triggeredBy', 'user'] }, 1, 0] } },
          scheduleTriggered: { $sum: { $cond: [{ $eq: ['$triggeredBy', 'schedule'] }, 1, 0] } },
          pirTriggered: { $sum: { $cond: [{ $eq: ['$triggeredBy', 'pir'] }, 1, 0] } },
          systemTriggered: { $sum: { $cond: [{ $eq: ['$triggeredBy', 'system'] }, 1, 0] } }
        }
      }
    ]);

    res.json({ success: true, data: stats[0] || {} });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
