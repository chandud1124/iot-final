const Device = require('../models/Device');
const User = require('../models/User');
const { logger } = require('../middleware/logger');

class BulkOperations {
    static async bulkCreateDevices(devices, userId) {
        const results = {
            successful: [],
            failed: [],
            total: devices.length
        };

        for (const device of devices) {
            try {
                // Check for duplicate MAC address
                const existing = await Device.findOne({ macAddress: device.macAddress });
                if (existing) {
                    results.failed.push({
                        device: device,
                        error: 'MAC address already exists'
                    });
                    continue;
                }

                const newDevice = new Device({
                    ...device,
                    createdBy: userId,
                    lastModifiedBy: userId
                });

                await newDevice.save();
                results.successful.push(newDevice);
            } catch (error) {
                results.failed.push({
                    device: device,
                    error: error.message
                });
            }
        }

        return results;
    }

    static async bulkCreateUsers(users, adminId) {
        const results = {
            successful: [],
            failed: [],
            total: users.length
        };

        for (const user of users) {
            try {
                // Check for duplicate email
                const existing = await User.findOne({ email: user.email });
                if (existing) {
                    results.failed.push({
                        user: user,
                        error: 'Email already exists'
                    });
                    continue;
                }

                const newUser = new User({
                    ...user,
                    createdBy: adminId,
                    lastModifiedBy: adminId
                });

                await newUser.save();
                results.successful.push(newUser);
            } catch (error) {
                results.failed.push({
                    user: user,
                    error: error.message
                });
            }
        }

        return results;
    }

    static async bulkUpdateDevices(updates) {
        const results = {
            successful: [],
            failed: [],
            total: updates.length
        };

        for (const update of updates) {
            try {
                const device = await Device.findByIdAndUpdate(
                    update.id,
                    { $set: update.changes },
                    { new: true, runValidators: true }
                );

                if (!device) {
                    results.failed.push({
                        update: update,
                        error: 'Device not found'
                    });
                    continue;
                }

                results.successful.push(device);
            } catch (error) {
                results.failed.push({
                    update: update,
                    error: error.message
                });
            }
        }

        return results;
    }
}

module.exports = BulkOperations;
