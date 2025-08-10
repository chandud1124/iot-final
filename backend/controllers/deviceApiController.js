const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

exports.getDeviceConfig = async (req, res) => {
    try {
        const { macAddress } = req.params;

        const device = await Device.findOne({ macAddress });
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Format configuration for ESP32
        const config = {
            deviceId: device._id,
            name: device.name,
            switches: device.switches.map(sw => ({
                id: sw._id,
                name: sw.name,
                relayGpio: sw.relayGpio,
                manualSwitchEnabled: sw.manualSwitchEnabled,
                manualSwitchGpio: sw.manualSwitchGpio,
                usePir: sw.usePir
            })),
            pirEnabled: device.pirEnabled,
            pirGpio: device.pirGpio,
            pirAutoOffDelay: device.pirAutoOffDelay
        };

        res.json(config);
    } catch (error) {
        console.error('Error getting device config:', error);
        res.status(500).json({ error: 'Failed to get device config' });
    }
};

exports.updateDeviceStatus = async (req, res) => {
    try {
        const { macAddress } = req.params;
        const { switchId, state } = req.body;

        const device = await Device.findOne({ macAddress });
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Update switch state if provided
        if (switchId && state !== undefined) {
            const switchToUpdate = device.switches.id(switchId);
            if (!switchToUpdate) {
                return res.status(404).json({ error: 'Switch not found' });
            }
            switchToUpdate.state = state;
        }

        // Update last seen timestamp
        device.lastSeen = new Date();
        await device.save();

        // Log the activity
        await ActivityLog.create({
            deviceId: device._id,
            action: 'status_update',
            details: statusData
        });

        res.json({ success: true, device });
    } catch (error) {
        console.error('Error updating device status:', error);
        res.status(500).json({ 
            error: 'Failed to update device status',
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR'
        });
    }
};

exports.getDeviceCommands = async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const device = await Device.findById(deviceId);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Return any pending commands for the device
        const commands = device.pendingCommands || [];
        
        // Clear pending commands after sending
        device.pendingCommands = [];
        await device.save();

        res.json({ commands });
    } catch (error) {
        console.error('Error fetching device commands:', error);
        res.status(500).json({ error: 'Failed to fetch device commands' });
    }
};

exports.sendCommand = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { command } = req.body;

        const device = await Device.findById(deviceId);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Add command to device's pending commands
        if (!device.pendingCommands) {
            device.pendingCommands = [];
        }
        device.pendingCommands.push(command);
        await device.save();

        // Log the command
        await ActivityLog.create({
            deviceId: device._id,
            action: 'command_sent',
            details: command
        });

        res.json({ success: true, message: 'Command queued successfully' });
    } catch (error) {
        console.error('Error sending command:', error);
        res.status(500).json({ error: 'Failed to send command' });
    }
};
