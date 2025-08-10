require('dotenv').config();
const mongoose = require('mongoose');
const { logger } = require('../middleware/logger');
const ActivityLog = require('../models/ActivityLog');
const SecurityAlert = require('../models/SecurityAlert');

const monitorLogs = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dwell-control');
    logger.info('Connected to MongoDB');

    // Get last 24 hours of activity logs
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const activityLogs = await ActivityLog.find({
      createdAt: { $gte: oneDayAgo }
    })
    .sort({ createdAt: -1 })
    .limit(100);

    console.log('\n=== Last 100 Activity Logs ===');
    activityLogs.forEach(log => {
      console.log(`[${log.createdAt.toISOString()}] ${log.action}: ${log.details || ''}`);
    });

    // Get security alerts
    const securityAlerts = await SecurityAlert.find({
      createdAt: { $gte: oneDayAgo }
    })
    .sort({ createdAt: -1 })
    .limit(50);

    console.log('\n=== Last 50 Security Alerts ===');
    securityAlerts.forEach(alert => {
      console.log(`[${alert.createdAt.toISOString()}] ${alert.alertType}: ${alert.details || ''}`);
    });

  } catch (error) {
    logger.error('Error monitoring logs:', error);
  } finally {
    await mongoose.disconnect();
  }
};

monitorLogs();
