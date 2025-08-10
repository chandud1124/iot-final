
const Device = require('../models/Device');
const crypto = require('crypto');
const ActivityLog = require('../models/ActivityLog');
const SecurityAlert = require('../models/SecurityAlert');
// Access io via req.app.get('io') where needed instead of legacy socketService

const getAllDevices = async (req, res) => {
  try {
    let query = {};
    
    if (req.user.role !== 'admin') {
      query._id = { $in: req.user.assignedDevices };
    }

    const devices = await Device.find(query).populate('assignedUsers', 'name email role');
    
    res.json({
      success: true,
      data: devices
    });
  } catch (error) {
    if (error && error.code === 11000) {
      const dupField = Object.keys(error.keyPattern || {})[0];
      return res.status(400).json({
        error: 'Validation failed',
        details: `Device with this ${dupField || 'value'} already exists`
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const createDevice = async (req, res) => {
  try {
    const {
      name,
      macAddress,
      ipAddress,
      location,
      classroom,
      pirEnabled = false,
      pirGpio,
      pirAutoOffDelay = 300, // 5 minutes default
      switches = []
    } = req.body;

  // Validate required fields (ipAddress also required by schema)
  if (!name || !macAddress || !location || !ipAddress) {
      return res.status(400).json({
        error: 'Validation failed',
    details: 'Name, MAC address, IP address, and location are required'
      });
    }

    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    if (!macRegex.test(macAddress)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Invalid MAC address format'
      });
    }

    // Check for existing device with same MAC address
    const existingDevice = await Device.findOne({ macAddress });
    if (existingDevice) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Device with this MAC address already exists'
      });
    }

    // Validate IP address format & duplicates
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Invalid IP address format'
      });
    }
    const octetsOk = ipAddress.split('.').every(o => Number(o) >=0 && Number(o) <=255);
    if (!octetsOk) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Each IP octet must be between 0 and 255'
      });
    }
    const existingIP = await Device.findOne({ ipAddress });
    if (existingIP) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Device with this IP address already exists'
      });
    }

    // Ensure GPIO uniqueness across primary and manual switch pins
    const primaryGpios = switches.map(sw => sw.gpio);
    const manualGpios = switches.filter(sw => sw.manualSwitchEnabled && sw.manualSwitchGpio !== undefined).map(sw => sw.manualSwitchGpio);
    const allGpios = [...primaryGpios, ...manualGpios];
    if (new Set(allGpios).size !== allGpios.length) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Duplicate GPIO pin detected across switches or manual switches'
      });
    }

    // Create new device
    // Generate a secure device secret (48 hex chars) if not provided
    const deviceSecret = crypto.randomBytes(24).toString('hex');

    const device = new Device({
      name,
      macAddress,
      ipAddress,
      location,
      classroom,
      pirEnabled,
      pirGpio,
      pirAutoOffDelay,
      switches: switches.map(sw => ({
        ...sw,
        state: false, // Initialize all switches to off
        lastStateChange: new Date()
      })),
      deviceSecret,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id
    });

    await device.save();

    // Log activity with new action type
    try {
      await ActivityLog.create({
        deviceId: device._id,
        action: 'device_created',
        triggeredBy: 'system',
        userId: req.user.id,
        userName: req.user.name,
        deviceName: device.name,
        classroom: device.classroom,
        location: device.location
      });
    } catch (logErr) {
      if (process.env.NODE_ENV !== 'production') console.warn('[deviceController] activity log failed', logErr.message);
    }

    // Broadcast new device
    req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });

    // Include secret separately so API clients can capture it (model hides it by select:false in future fetches)
    res.status(201).json({
      success: true,
      data: device,
      deviceSecret // expose once on create
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      name,
      macAddress,
      ipAddress,
      location,
      classroom,
      pirEnabled,
      pirGpio,
      pirAutoOffDelay,
      switches
    } = req.body;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Check for duplicate MAC address if changed
    if (macAddress && macAddress !== device.macAddress) {
      const existingDeviceMAC = await Device.findOne({ macAddress });
      if (existingDeviceMAC) {
        return res.status(400).json({ message: 'Device with this MAC address already exists' });
      }
    }

    // Check for duplicate IP address if changed
    if (ipAddress && ipAddress !== device.ipAddress) {
      const existingDeviceIP = await Device.findOne({ ipAddress });
      if (existingDeviceIP) {
        return res.status(400).json({ message: 'Device with this IP address already exists' });
      }
    }

    // Update device
    device.name = name || device.name;
    device.macAddress = macAddress || device.macAddress;
    device.ipAddress = ipAddress || device.ipAddress;
    device.location = location || device.location;
    device.classroom = classroom || device.classroom;
    device.pirEnabled = pirEnabled !== undefined ? pirEnabled : device.pirEnabled;
    device.pirGpio = pirGpio || device.pirGpio;
    device.pirAutoOffDelay = pirAutoOffDelay || device.pirAutoOffDelay;
    
    if (switches && Array.isArray(switches)) {
      const primaryGpiosU = switches.map(sw => sw.gpio);
      const manualGpiosU = switches.filter(sw => sw.manualSwitchEnabled && sw.manualSwitchGpio !== undefined).map(sw => sw.manualSwitchGpio);
      const all = [...primaryGpiosU, ...manualGpiosU];
      if (new Set(all).size !== all.length) {
        return res.status(400).json({ message: 'Duplicate GPIO pin across switches/manual switches' });
      }
      device.switches = switches.map(sw => ({
        ...sw,
        state: sw.state !== undefined ? sw.state : false
      }));
    }

    device.lastModifiedBy = req.user.id;
    await device.save();

    // Log activity with new action
    try {
      await ActivityLog.create({
        deviceId: device._id,
        deviceName: device.name,
        action: 'device_updated',
        triggeredBy: 'user',
        userId: req.user.id,
        userName: req.user.name,
        classroom: device.classroom,
        location: device.location,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (logErr) {
      if (process.env.NODE_ENV !== 'production') console.warn('[deviceController] activity log failed', logErr.message);
    }

    req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });

    res.json({
      success: true,
      message: 'Device updated successfully',
      data: device
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const toggleSwitch = async (req, res) => {
  try {
    const { deviceId, switchId } = req.params;
    const { state, triggeredBy = 'user' } = req.body;

    const device = await Device.findById(deviceId);
      if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Block toggle if device is offline to ensure consistency with UI
    if (device.status && device.status !== 'online') {
      // Emit socket event notifying clients the toggle was blocked
      try {
        req.app.get('io').emit('device_toggle_blocked', {
          deviceId,
          switchId,
          reason: 'offline',
          requestedState: state,
          timestamp: Date.now()
        });
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.warn('[emit device_toggle_blocked failed]', e.message);
      }
      return res.status(409).json({ message: 'Device is offline. Cannot toggle switches.' });
    }

    const switchIndex = device.switches.findIndex(sw => sw._id.toString() === switchId);
    if (switchIndex === -1) {
      return res.status(404).json({ message: 'Switch not found' });
    }

    const oldState = device.switches[switchIndex].state;
    device.switches[switchIndex].state = state !== undefined ? state : !oldState;
    
    await device.save();

    // Log activity
    await ActivityLog.create({
      deviceId: device._id,
      deviceName: device.name,
      switchId: switchId,
      switchName: device.switches[switchIndex].name,
      action: device.switches[switchIndex].state ? 'on' : 'off',
      triggeredBy,
      userId: req.user.id,
      userName: req.user.name,
      classroom: device.classroom,
      location: device.location,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });

      // Push command to ESP32 if connected through raw WebSocket
      try {
        if (global.wsDevices && device.macAddress) {
          const ws = global.wsDevices.get(device.macAddress.toUpperCase());
          if (ws && ws.readyState === 1) { // OPEN
            const payload = {
              type: 'switch_command',
              mac: device.macAddress,
              gpio: device.switches[switchIndex].relayGpio,
              state: device.switches[switchIndex].state,
            };
            ws.send(JSON.stringify(payload));
          }
        }
      } catch (e) {
        // Log but don't fail request
        console.error('[switch_command push failed]', e.message);
      }

    res.json({
      success: true,
      data: device
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDeviceStats = async (req, res) => {
  try {
    let matchQuery = {};
    
    if (req.user.role !== 'admin') {
      matchQuery._id = { $in: req.user.assignedDevices };
    }

    const stats = await Device.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalDevices: { $sum: 1 },
          onlineDevices: {
            $sum: { $cond: [{ $eq: ['$status', 'online'] }, 1, 0] }
          },
          totalSwitches: {
            $sum: { $size: '$switches' }
          },
          activeSwitches: {
            $sum: {
              $size: {
                $filter: {
                  input: '$switches',
                  cond: { $eq: ['$$this.state', true] }
                }
              }
            }
          },
          totalPirSensors: {
            $sum: { $cond: [{ $ne: ['$pirSensor', null] }, 1, 0] }
          },
          activePirSensors: {
            $sum: { $cond: [{ $eq: ['$pirSensor.isActive', true] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalDevices: 0,
        onlineDevices: 0,
        totalSwitches: 0,
        activeSwitches: 0,
        totalPirSensors: 0,
        activePirSensors: 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDeviceById = async (req, res) => {
  try {
    const device = await Device.findById(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    res.json({ success: true, data: device });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await device.deleteOne();

    await ActivityLog.create({
      deviceId: device._id,
      deviceName: device.name,
      action: 'device_deleted',
      triggeredBy: 'user',
      userId: req.user.id,
      userName: req.user.name,
      classroom: device.classroom,
      location: device.location,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    req.app.get('io').emit('device_state_changed', { deviceId: device.id, deleted: true });

    res.json({ success: true, message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk toggle all switches (or all accessible devices for non-admin roles)
const bulkToggleSwitches = async (req, res) => {
  try {
    const { state } = req.body; // required boolean
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state boolean required' });
    }

    // Scope devices based on user role (reuse logic from getAllDevices)
    const match = {};
    if (req.user.role !== 'admin') {
      match._id = { $in: req.user.assignedDevices };
    }

    const devices = await Device.find(match);
    let switchesChanged = 0;

  for (const device of devices) {
      let deviceModified = false;
      device.switches.forEach(sw => {
        if (sw.state !== state) {
          sw.state = state;
          deviceModified = true;
          switchesChanged++;
        }
      });
      if (deviceModified) {
        await device.save();
        // Log one aggregated activity entry per device to limit log volume
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
      action: state ? 'bulk_on' : 'bulk_off',
            triggeredBy: 'user',
            userId: req.user.id,
            userName: req.user.name,
            classroom: device.classroom,
            location: device.location,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
        } catch (logErr) {
          if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleSwitches] log failed', logErr.message);
        }
    // Broadcast each device update
    req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });
      }
    }

    res.json({
      success: true,
      message: `Bulk toggled switches ${state ? 'on' : 'off'}`,
      devices: devices,
      switchesChanged
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk toggle by switch type
const bulkToggleByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { state } = req.body;
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state boolean required' });
    }
    const match = {};
    if (req.user.role !== 'admin') {
      match._id = { $in: req.user.assignedDevices };
    }
    const devices = await Device.find(match);
    let switchesChanged = 0;
    for (const device of devices) {
      let modified = false;
      device.switches.forEach(sw => {
        if (sw.type === type && sw.state !== state) {
          sw.state = state;
          switchesChanged++;
          modified = true;
        }
      });
      if (modified) {
        await device.save();
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
            action: state ? 'bulk_on' : 'bulk_off',
            triggeredBy: 'user',
            userId: req.user.id,
            userName: req.user.name,
            classroom: device.classroom,
            location: device.location
          });
        } catch {}
        req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });
      }
    }
    res.json({ success: true, type, state, switchesChanged });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk toggle by location
const bulkToggleByLocation = async (req, res) => {
  try {
    const { location } = req.params;
    const { state } = req.body;
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state boolean required' });
    }
    const match = { location };
    if (req.user.role !== 'admin') {
      match._id = { $in: req.user.assignedDevices };
    }
    const devices = await Device.find(match);
    let switchesChanged = 0;
    for (const device of devices) {
      let modified = false;
      device.switches.forEach(sw => {
        if (sw.state !== state) {
          sw.state = state;
          switchesChanged++;
          modified = true;
        }
      });
      if (modified) {
        await device.save();
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
            action: state ? 'bulk_on' : 'bulk_off',
            triggeredBy: 'user',
            userId: req.user.id,
            userName: req.user.name,
            classroom: device.classroom,
            location: device.location
          });
        } catch {}
        req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device });
      }
    }
    res.json({ success: true, location, state, switchesChanged });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllDevices,
  createDevice,
  toggleSwitch,
  getDeviceStats,
  getDeviceById,
  updateDevice,
  deleteDevice,
  bulkToggleSwitches
  ,bulkToggleByType
  ,bulkToggleByLocation
};
