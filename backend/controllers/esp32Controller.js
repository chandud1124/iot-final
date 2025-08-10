const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

/**
 * Get device configuration for ESP32
 * GET /api/esp32/config/:macAddress
 */
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
      pirEnabled: device.pirEnabled,
      pirGpio: device.pirGpio,
      pirAutoOffDelay: device.pirAutoOffDelay,
      switches: device.switches.map(sw => ({
        id: sw._id,
        name: sw.name,
        relayGpio: sw.relayGpio,
        usePir: sw.usePir,
        manualSwitchEnabled: sw.manualSwitchEnabled,
        manualSwitchGpio: sw.manualSwitchGpio
      }))
    };

    res.json(config);
  } catch (error) {
    console.error('Error getting device config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update device state from ESP32
 * POST /api/esp32/state/:macAddress
 */
exports.updateDeviceStatus = async (req, res) => {
  try {
    const { macAddress } = req.params;
    const { switchId, state } = req.body;

    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Update switch state
    const switchToUpdate = device.switches.id(switchId);
    if (!switchToUpdate) {
      return res.status(404).json({ error: 'Switch not found' });
    }

    switchToUpdate.state = state;
    device.lastSeen = new Date();
    await device.save();

    // Log activity
    await ActivityLog.create({
      deviceId: device._id,
      switchId,
      action: 'state_change',
      details: { state, source: 'esp32' }
    });

    // Emit state change via WebSocket
    req.app.get('io').emit('switchStateChanged', {
      deviceId: device._id,
      switchId,
      state
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating device state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send command to ESP32
 * POST /api/esp32/command/:macAddress
 */
exports.sendCommand = async (req, res) => {
  try {
    const { macAddress } = req.params;
    const { switchId, state } = req.body;

    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const switchToUpdate = device.switches.id(switchId);
    if (!switchToUpdate) {
      return res.status(404).json({ error: 'Switch not found' });
    }

    // Add command to pending queue
    device.pendingCommands.push({
      type: 'setState',
      payload: {
        switchId,
        state
      }
    });

    await device.save();

    // Log activity
    await ActivityLog.create({
      deviceId: device._id,
      switchId,
      action: 'command_sent',
      details: { state, source: 'web' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
