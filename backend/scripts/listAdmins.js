const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-automation');
    const admins = await User.find({ role: 'admin' }).lean();
    if (!admins.length) {
      console.log('No admin users found.');
    } else {
      console.log('Admin users:');
      admins.forEach(a => {
        console.log(`- email: ${a.email} | active: ${a.isActive} | created: ${a.createdAt}`);
      });
    }
  } catch (e) {
    console.error('Error listing admins', e);
  } finally {
    await mongoose.disconnect();
  }
})();
