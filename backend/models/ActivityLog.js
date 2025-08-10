
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  deviceName: String,
  switchId: String,
  switchName: String,
  action: {
    type: String,
    enum: ['on', 'off', 'toggle', 'device_created', 'device_updated', 'device_deleted', 'bulk_on', 'bulk_off'],
    required: true
  },
  triggeredBy: {
    type: String,
    enum: ['user', 'schedule', 'pir', 'master', 'system'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: String,
  classroom: String,
  location: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  ip: String,
  userAgent: String,
  duration: Number,
  powerConsumption: Number
}, {
  timestamps: false
});

activityLogSchema.index({ deviceId: 1, timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ classroom: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
