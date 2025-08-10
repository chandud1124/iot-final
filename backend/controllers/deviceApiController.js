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
        const { switchId, state, switches, heartbeat } = req.body || {};

        // Case-insensitive match for MAC address
        const device = await Device.findOne({ macAddress: new RegExp('^' + macAddress + '$', 'i') });
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }

        let changed = false;

        // Update a single switch by id
        if (switchId && state !== undefined) {
            const switchToUpdate = device.switches.id(switchId);
            if (!switchToUpdate) {
                return res.status(404).json({ error: 'Switch not found' });
            }
            if (switchToUpdate.state !== state) {
                switchToUpdate.state = state;
                changed = true;
            }
        }

        // Bulk update (array of {id/state}) optionally sent by firmware
        if (Array.isArray(switches)) {
            switches.forEach(sw => {
                if (sw.id && typeof sw.state === 'boolean') {
                    const existing = device.switches.id(sw.id);
                    if (existing && existing.state !== sw.state) {
                        existing.state = sw.state;
                        changed = true;
                    }
                }
            });
        }

        // Always update lastSeen & mark device online on heartbeat or any update
        device.lastSeen = new Date();
        if (device.status !== 'online') {
            device.status = 'online';
            changed = true; // status change
        }

        if (changed) {
            await device.save();
        } else {
            // Save lastSeen even if no switch changes (avoid validation if nothing else changed)
            await device.updateOne({ lastSeen: device.lastSeen, status: 'online' });
        }

        // Log activity only when state actually changed (not for pure heartbeat)
        if (changed) {
            await ActivityLog.create({
                deviceId: device._id,
                deviceName: device.name,
                action: 'status_update',
                triggeredBy: 'device',
                details: {
                    heartbeat: !!heartbeat,
                    singleSwitch: switchId ? { switchId, state } : undefined,
                    bulkCount: Array.isArray(switches) ? switches.length : undefined
                }
            }).catch(()=>{});
        }

        // Emit socket event so UI refreshes in real-time
        try {
            req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });
        } catch (e) {
            if (process.env.NODE_ENV !== 'production') console.warn('[emit device_state_changed failed]', e.message);
        }

        res.json({ success: true, data: device, changed });
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
