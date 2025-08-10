const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const createAdminUser = async () => {
  try {
  // Use the SAME default DB name as server.js (iot-automation) to avoid creating admins in a different database.
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-automation');
    
    // Only create this specific email if not present (do not exit just because another admin exists)
    const existing = await User.findOne({ email: 'admin@example.com' });
    if (existing) {
      console.log('Admin user admin@example.com already exists');
      return;
    }

    const admin = await User.create({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'admin123',  // This will be hashed by the User model
      role: 'admin',
      accessLevel: 'full',
      department: 'Administration',
      isActive: true
    });

  console.log('Admin user created successfully:', admin.email);
  console.log('Default password: admin123');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
  }
};

createAdminUser();
