const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-automation');
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      console.log('No admin user found to reset.');
      process.exit(1);
    }
    const newPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    admin.password = newPassword; // pre-save hook will hash it once
    await admin.save();
    console.log(`Admin password reset to '${newPassword}'. Email: ${admin.email}`);
  } catch (e) {
    console.error('Failed to reset admin password', e);
  } finally {
    await mongoose.disconnect();
  }
})();
