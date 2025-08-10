
const mongoose = require('mongoose');

const securityAlertSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  deviceName: String,
  location: String,
  classroom: String,
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['timeout', 'unauthorized_access', 'device_offline', 'motion_override'],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  acknowledged: {
    type: Boolean,
    default: false
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledgedAt: Date,
  resolved: {
    type: Boolean,
    default: false
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  metadata: {
    switchId: String,
    switchName: String,
    duration: Number,
    autoResolved: Boolean
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SecurityAlert', securityAlertSchema);
