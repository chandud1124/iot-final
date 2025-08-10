// Usage: node scripts/printOrSetDeviceSecret.js FC:B4:67:EF:33:C8 [--set]
// If --set passed and deviceSecret missing, generates and saves a new one.
// Requires MONGO_URI in environment (.env) or defaults to mongodb://localhost:27017/iot

const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();
const Device = require('../models/Device');

(async () => {
  const mac = process.argv[2];
  const doSet = process.argv.includes('--set');
  if (!mac) {
    console.error('MAC required. Example: node scripts/printOrSetDeviceSecret.js FC:B4:67:EF:33:C8 [--set]');
    process.exit(1);
  }
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/iot';
  await mongoose.connect(uri);
  let device = await Device.findOne({ macAddress: mac }).select('+deviceSecret');
  if (!device) {
    console.error('Device not found for MAC', mac);
    process.exit(2);
  }
  if (!device.deviceSecret && doSet) {
    device.deviceSecret = crypto.randomBytes(24).toString('hex');
    await device.save();
    console.log('Generated and saved new deviceSecret.');
  }
  // Re-fetch to ensure we have updated secret
  if (!device.deviceSecret) {
    console.log('deviceSecret is currently missing. Run again with --set to create one.');
  } else {
    console.log('deviceSecret:', device.deviceSecret);
  }
  await mongoose.disconnect();
  process.exit(0);
})();
