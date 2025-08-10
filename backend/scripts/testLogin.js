const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

(async () => {
  try {
    const emailArg = process.argv[2];
    const passArg = process.argv[3];
    if (!emailArg || !passArg) {
      console.log('Usage: node backend/scripts/testLogin.js <email> <password>');
      process.exit(1);
    }
    const email = emailArg.trim().toLowerCase();
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-automation');
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log('No user found for email:', email);
      process.exit(2);
    }
    const match = await bcrypt.compare(passArg, user.password);
    console.log('User found. Match:', match);
    if (!match) {
      console.log('Stored hash snippet:', user.password.slice(0, 20) + '...');
    }
  } catch (e) {
    console.error('testLogin error', e);
  } finally {
    await mongoose.disconnect();
  }
})();
