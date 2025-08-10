const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

(async () => {
  try {
    const email = (process.argv[2] || process.env.ADMIN_EMAIL || 'root@system.local').toLowerCase();
    const password = process.argv[3] || process.env.ADMIN_PASSWORD || 'ChangeMeNow!123';
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-automation');

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: 'Root Administrator',
        email,
        password,
        role: 'admin',
        accessLevel: 'full',
        department: 'Core'
      });
      console.log('Created admin:', email);
    } else {
      user.password = password; // will re-hash via pre-save
      user.role = 'admin';
      user.accessLevel = 'full';
      user.isActive = true;
      await user.save();
      console.log('Updated existing admin:', email);
    }

    console.log('Admin ready. Email:', email, 'Password:', password);
  } catch (e) {
    console.error('forceAdmin error', e);
  } finally {
    await mongoose.disconnect();
  }
})();
