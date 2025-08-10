const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  notifications: {
    email: {
      enabled: {
        type: Boolean,
        default: false
      },
      recipients: [{
        type: String
      }]
    },
    push: {
      enabled: {
        type: Boolean,
        default: false
      }
    }
  },
  security: {
    deviceOfflineThreshold: {
      type: Number,
      default: 300 // 5 minutes in seconds
    },
    motionDetectionEnabled: {
      type: Boolean,
      default: true
    }
  },
  created: {
    type: Date,
    default: Date.now
  },
  lastModified: {
    type: Date,
    default: Date.now
  }
});

// Update lastModified on save
settingsSchema.pre('save', function(next) {
  this.lastModified = new Date();
  next();
});

module.exports = mongoose.model('Settings', settingsSchema);
