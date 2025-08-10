require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Device = require('../models/Device');
const { logger } = require('../middleware/logger');

const users = [
  {
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin',
    department: 'IT',
    accessLevel: 'full'
  },
  {
    name: 'Faculty User',
    email: 'faculty@example.com',
    password: 'faculty123',
    role: 'faculty',
    department: 'Computer Science',
    accessLevel: 'limited'
  },
  {
    name: 'Security User',
    email: 'security@example.com',
    password: 'security123',
    role: 'security',
    department: 'Security',
    accessLevel: 'limited'
  }
];

const devices = [
  {
    name: 'Lab 101',
    macAddress: '00:1B:44:11:3A:B7',
    ipAddress: '192.168.1.101',
    location: 'First Floor',
    classroom: 'Computer Lab 101',
    pirEnabled: true,
    pirGpio: 18,
    pirAutoOffDelay: 300,
    switches: [
      { name: 'Main Lights', gpio: 23, state: false, type: 'light' },
      { name: 'Fan 1', gpio: 24, state: false, type: 'fan' },
      { name: 'Fan 2', gpio: 25, state: false, type: 'fan' },
      { name: 'AC', gpio: 26, state: false, type: 'ac' }
    ]
  },
  {
    name: 'Lab 102',
    macAddress: '00:1B:44:11:3A:B8',
    ipAddress: '192.168.1.102',
    location: 'First Floor',
    classroom: 'Computer Lab 102',
    pirEnabled: true,
    pirGpio: 18,
    pirAutoOffDelay: 300,
    switches: [
      { name: 'Main Lights', gpio: 23, state: false, type: 'light' },
      { name: 'Fan 1', gpio: 24, state: false, type: 'fan' },
      { name: 'Fan 2', gpio: 25, state: false, type: 'fan' },
      { name: 'AC', gpio: 26, state: false, type: 'ac' }
    ]
  }
];

const setupTestData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dwell-control');
    logger.info('Connected to MongoDB');

    // Create users
    for (const userData of users) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = await User.create({
          ...userData,
          password: hashedPassword
        });
        logger.info(`Created user: ${user.email} (${user.role})`);
      } else {
        logger.info(`User already exists: ${userData.email}`);
      }
    }

    // Create devices
    for (const deviceData of devices) {
      const existingDevice = await Device.findOne({ macAddress: deviceData.macAddress });
      if (!existingDevice) {
        const device = await Device.create({
          ...deviceData,
          status: 'offline',
          assignedUsers: []
        });
        logger.info(`Created device: ${device.name}`);
      } else {
        logger.info(`Device already exists: ${deviceData.name}`);
      }
    }

    logger.info('Test data setup completed successfully');
  } catch (error) {
    logger.error('Error setting up test data:', error);
  } finally {
    await mongoose.disconnect();
  }
};

setupTestData();
