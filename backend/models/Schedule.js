
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'once'],
    required: true
  },
  time: {
    type: String,
    required: true
  },
  days: [{
    type: Number,
    min: 0,
    max: 6
  }],
  action: {
    type: String,
    enum: ['on', 'off'],
    required: true
  },
  duration: Number,
  timeoutMinutes: {
    type: Number,
    default: 0
  },
  switches: [{
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device'
    },
    switchId: String
  }],
  checkHolidays: {
    type: Boolean,
    default: true
  },
  respectMotion: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastRun: Date,
  nextRun: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('Schedule', scheduleSchema);
