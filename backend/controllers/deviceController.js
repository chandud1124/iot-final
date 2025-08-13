
const Device = require('../models/Device');
const { logger } = require('../middleware/logger');
// Per-device command sequence for strict ordering to devices
const _cmdSeqMap = new Map(); // mac -> last seq
function nextCmdSeq(mac) {
  if (!mac) return 0;
  const key = mac.toUpperCase();
  const prev = _cmdSeqMap.get(key) || 0;
  const next = prev + 1;
  _cmdSeqMap.set(key, next);
  return next;
}
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
        name: sw.name,
        gpio: sw.gpio,
        type: sw.type || 'relay',
        state: false, // force default off; ignore provided state
        icon: sw.icon || 'lightbulb',
        manualSwitchEnabled: !!sw.manualSwitchEnabled,
        manualSwitchGpio: sw.manualSwitchGpio,
        manualMode: sw.manualMode || 'maintained',
        manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : true,
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
  const emitDeviceStateChanged = req.app.get('emitDeviceStateChanged');
  if (emitDeviceStateChanged) {
    emitDeviceStateChanged(device, { source: 'controller:createDevice' });
  } else {
    req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device, ts: Date.now() });
  }

    // Push updated config to ESP32 if connected (include manual fields)
    try {
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) {
          const cfgMsg = {
            type: 'config_update',
            mac: device.macAddress,
            switches: device.switches.map((sw, idx) => ({
              order: idx,
              gpio: sw.gpio,
              relayGpio: sw.relayGpio,
              name: sw.name,
              manualSwitchGpio: sw.manualSwitchGpio,
              manualSwitchEnabled: sw.manualSwitchEnabled,
              manualMode: sw.manualMode,
              manualActiveLow: sw.manualActiveLow,
              state: sw.state
            })),
            pirEnabled: device.pirEnabled,
            pirGpio: device.pirGpio,
            pirAutoOffDelay: device.pirAutoOffDelay
          };
          ws.send(JSON.stringify(cfgMsg));
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[device_update config_update push failed]', e.message);
    }
    // Broadcast new configuration as separate config_update
    try {
      const cfgMsg = {
        type: 'config_update',
        deviceId: device.id,
        switches: device.switches.map((sw, idx) => ({
          order: idx,
          gpio: sw.gpio,
          relayGpio: sw.relayGpio,
          name: sw.name,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualSwitchEnabled: sw.manualSwitchEnabled,
          manualMode: sw.manualMode,
          manualActiveLow: sw.manualActiveLow,
          state: sw.state
        })),
        pirEnabled: device.pirEnabled,
        pirGpio: device.pirGpio,
        pirAutoOffDelay: device.pirAutoOffDelay
      };
      req.app.get('io').emit('config_update', cfgMsg);
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(cfgMsg));
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[config_update emit failed]', e.message);
    }

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
    
    let removedSwitches = [];
    const oldSwitchesSnapshot = device.switches ? device.switches.map(sw => sw.toObject ? sw.toObject() : { ...sw }) : [];
    if (switches && Array.isArray(switches)) {
      const primaryGpiosU = switches.map(sw => sw.gpio);
      const manualGpiosU = switches.filter(sw => sw.manualSwitchEnabled && sw.manualSwitchGpio !== undefined).map(sw => sw.manualSwitchGpio);
      const all = [...primaryGpiosU, ...manualGpiosU];
      if (new Set(all).size !== all.length) {
        return res.status(400).json({ message: 'Duplicate GPIO pin across switches/manual switches' });
      }
      // Build new ordered switch array preserving state if gpio changed; capture warnings
      const warnings = [];
      device.switches = switches.map((sw, idx) => {
        const existing = device.switches.id(sw.id) || device.switches.find(s => s.name === sw.name);
        // Preserve existing state; new switches default to false. Ignore any incoming sw.state (initial state not user-settable here).
        const state = existing ? existing.state : false;
        if (existing) {
          if (existing.gpio !== sw.gpio && existing.state === true) {
            warnings.push({ type: 'gpio_changed_active', switchName: existing.name, from: existing.gpio, to: sw.gpio });
          }
        }
        return {
          name: sw.name,
          gpio: sw.gpio,
          type: sw.type || (existing && existing.type) || 'relay',
          state,
          icon: sw.icon || (existing && existing.icon) || 'lightbulb',
          manualSwitchEnabled: !!sw.manualSwitchEnabled,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualMode: sw.manualMode || (existing && existing.manualMode) || 'maintained',
          manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : (existing ? existing.manualActiveLow : true)
        };
      });
      // Determine removed switches (by id or name fallback)
      removedSwitches = oldSwitchesSnapshot.filter(osw => !device.switches.some(nsw => (osw._id && nsw._id && osw._id.toString() === nsw._id.toString()) || (osw.name && nsw.name && osw.name === nsw.name)));
      // Attach warnings to response later
      req._switchWarnings = warnings;
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

  const emitDeviceStateChanged = req.app.get('emitDeviceStateChanged');
  if (emitDeviceStateChanged) {
    emitDeviceStateChanged(device, { source: 'controller:updateDevice' });
  } else {
    req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device, ts: Date.now() });
  }

    // If any switches were removed, proactively send OFF command for their relay gpios to ensure hardware deactivates them
    try {
      if (removedSwitches.length && global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) {
          removedSwitches.forEach(rsw => {
            const gpio = rsw.relayGpio || rsw.gpio;
            if (gpio !== undefined) {
              try {
                logger.info('[hw] switch_command (removed->OFF) push', { mac: device.macAddress, gpio, state: false });
              } catch {}
              ws.send(JSON.stringify({ type: 'switch_command', mac: device.macAddress, gpio, state: false, removed: true, seq: nextCmdSeq(device.macAddress) }));
            }
          });
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[removedSwitches off push failed]', e.message);
    }

    // Broadcast updated configuration (mirrors createDevice flow) so frontend & firmware can reconcile list
    try {
      const cfgMsg = {
        type: 'config_update',
        deviceId: device.id,
        switches: device.switches.map((sw, idx) => ({
          order: idx,
          gpio: sw.gpio,
          relayGpio: sw.relayGpio,
          name: sw.name,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualSwitchEnabled: sw.manualSwitchEnabled,
          manualMode: sw.manualMode,
          manualActiveLow: sw.manualActiveLow,
          state: sw.state
        })),
        pirEnabled: device.pirEnabled,
        pirGpio: device.pirGpio,
        pirAutoOffDelay: device.pirAutoOffDelay
      };
      req.app.get('io').emit('config_update', cfgMsg);
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(cfgMsg));
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[config_update emit failed updateDevice]', e.message);
    }

    res.json({
      success: true,
      message: 'Device updated successfully',
      data: device,
      warnings: req._switchWarnings || []
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
      // queue intent instead of hard blocking
      const targetSw = device.switches.find(sw => sw._id.toString() === switchId);
      if (!targetSw) return res.status(404).json({ message: 'Switch not found' });
      const desired = state !== undefined ? state : !targetSw.state;
      // replace any existing intent for same gpio
      device.queuedIntents = (device.queuedIntents || []).filter(q => q.switchGpio !== (targetSw.relayGpio || targetSw.gpio));
      device.queuedIntents.push({ switchGpio: targetSw.relayGpio || targetSw.gpio, desiredState: desired, createdAt: new Date() });
      await device.save();
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[toggleSwitch] queued intent while offline', {
          deviceId: device._id.toString(), mac: device.macAddress, switchId, desired
        });
      }
      try { req.app.get('io').emit('device_toggle_queued', { deviceId, switchId, desired }); } catch {}
      return res.status(202).json({ message: 'Device offline. Toggle queued.', queued: true });
    }

    // If marked online but not identified through raw WS, block with 409
    try {
      const ws = global.wsDevices && device.macAddress ? global.wsDevices.get(device.macAddress.toUpperCase()) : null;
      if (!ws || ws.readyState !== 1) {
        return res.status(409).json({
          success: false,
          code: 'device_not_identified',
          message: 'Device is not identified/connected. Please wait for the device to connect and try again.'
        });
      }
    } catch {}

    const switchIndex = device.switches.findIndex(sw => sw._id.toString() === switchId);
    if (switchIndex === -1) {
      return res.status(404).json({ message: 'Switch not found' });
    }

    // Compute desired state based on current snapshot, but persist atomically
    const desiredState = state !== undefined ? state : !device.switches[switchIndex].state;
    const now = new Date();
    const updated = await Device.findOneAndUpdate(
      { _id: deviceId, 'switches._id': switchId },
      { $set: { 'switches.$.state': desiredState, 'switches.$.lastStateChange': now, lastModifiedBy: req.user.id } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Switch not found' });
    }

    // Log activity
    // Resolve updated switch for logging and push
    const updatedSwitch = updated.switches.find(sw => sw._id.toString() === switchId) || updated.switches[switchIndex];
    await ActivityLog.create({
      deviceId: updated._id,
      deviceName: updated.name,
      switchId: switchId,
      switchName: updatedSwitch?.name,
      action: desiredState ? 'on' : 'off',
      triggeredBy,
      userId: req.user.id,
      userName: req.user.name,
      classroom: updated.classroom,
      location: updated.location,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Do not broadcast device_state_changed immediately to avoid UI desync if hardware fails.
    // Instead, emit a lightweight intent event; authoritative updates will come from switch_result/state_update.
    try {
      req.app.get('io').emit('switch_intent', {
        deviceId: updated.id,
        switchId,
        gpio: (updatedSwitch && (updatedSwitch.relayGpio || updatedSwitch.gpio)) || (device.switches[switchIndex].relayGpio || device.switches[switchIndex].gpio),
        desiredState,
        ts: Date.now()
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[switch_intent emit failed]', e.message);
    }

      // Push command to ESP32 if connected through raw WebSocket
      let dispatchedToHardware = false;
      let hwReason = 'not_attempted';
      try {
        if (global.wsDevices && updated.macAddress) {
          const ws = global.wsDevices.get(updated.macAddress.toUpperCase());
          if (ws && ws.readyState === 1) { // OPEN
            const payload = {
              type: 'switch_command',
              mac: updated.macAddress,
              gpio: (updatedSwitch && (updatedSwitch.relayGpio || updatedSwitch.gpio)) || (device.switches[switchIndex].relayGpio || device.switches[switchIndex].gpio),
              state: desiredState,
              seq: nextCmdSeq(updated.macAddress)
            };
            try {
              logger.info('[hw] switch_command push', { mac: updated.macAddress, gpio: payload.gpio, state: payload.state, deviceId: updated._id.toString(), switchId });
            } catch {}
            ws.send(JSON.stringify(payload));
            dispatchedToHardware = true;
            hwReason = 'sent';
          } else {
            hwReason = ws ? `ws_not_open_state_${ws.readyState}` : 'ws_not_found';
          }
        } else {
          hwReason = 'wsDevices_map_missing';
        }
      } catch (e) {
        console.error('[switch_command push failed]', e.message);
        hwReason = 'exception_' + e.message;
      }

    res.json({
      success: true,
      data: updated,
      hardwareDispatch: dispatchedToHardware,
      hardwareDispatchReason: hwReason
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDeviceStats = async (req, res) => {
  try {
    const matchQuery = (req.user.role !== 'admin')
      ? { _id: { $in: req.user.assignedDevices } }
      : {};

    const devices = await Device.find(matchQuery)
      .select('status switches pirEnabled pirGpio pirAutoOffDelay pirSensorLastTriggered')
      .lean();

    const now = Date.now();
    const toMs = (s) => Math.max(0, ((typeof s === 'number' ? s : 30) || 30) * 1000);

    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const totalSwitches = devices.reduce((sum, d) => sum + (Array.isArray(d.switches) ? d.switches.length : 0), 0);
    const activeSwitches = devices.reduce((sum, d) => {
      if (d.status !== 'online') return sum;
      const on = (Array.isArray(d.switches) ? d.switches : []).filter(sw => !!sw.state).length;
      return sum + on;
    }, 0);
    const totalPirSensors = devices.filter(d => d.pirEnabled === true && d.pirGpio !== undefined && d.pirGpio !== null).length;
    const activePirSensors = devices.filter(d => {
      if (!(d.pirEnabled === true && d.pirGpio !== undefined && d.pirGpio !== null)) return false;
      const last = d.pirSensorLastTriggered ? new Date(d.pirSensorLastTriggered).getTime() : 0;
      const windowMs = toMs(d.pirAutoOffDelay);
      return last && (now - last) <= windowMs;
    }).length;

    res.json({
      success: true,
      data: {
        totalDevices,
        onlineDevices,
        totalSwitches,
        activeSwitches,
        totalPirSensors,
        activePirSensors
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDeviceById = async (req, res) => {
  try {
    // If admin wants secret, explicitly select it
    const includeSecret = req.query.includeSecret === '1' || req.query.includeSecret === 'true';
  let query = Device.findById(req.params.deviceId);
    if (includeSecret && req.user && req.user.role === 'admin') {
      query = query.select('+deviceSecret');
    }
    let device = await query;
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    // Optional PIN gate for secret (set DEVICE_SECRET_PIN in env). If set, must match ?secretPin=.
    if (includeSecret && req.user && req.user.role === 'admin') {
      const requiredPin = process.env.DEVICE_SECRET_PIN;
      if (requiredPin && (req.query.secretPin !== requiredPin)) {
        return res.status(403).json({ message: 'Invalid PIN' });
      }
    }
    // Auto-generate a secret if missing and admin requested it
    if (includeSecret && req.user && req.user.role === 'admin' && !device.deviceSecret) {
      const crypto = require('crypto');
      device.deviceSecret = crypto.randomBytes(24).toString('hex');
      await device.save();
    }
    // Avoid leaking secret unless explicitly requested
    const raw = device.toObject();
    if (!(includeSecret && req.user && req.user.role === 'admin')) {
      delete raw.deviceSecret;
    }
    res.json({ success: true, data: raw, deviceSecret: includeSecret && req.user && req.user.role === 'admin' ? raw.deviceSecret : undefined });
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

  const emitDeviceStateChanged = req.app.get('emitDeviceStateChanged');
  if (emitDeviceStateChanged) {
    emitDeviceStateChanged({ id: device.id, deleted: true }, { source: 'controller:deleteDevice' });
  } else {
    req.app.get('io').emit('device_state_changed', { deviceId: device.id, deleted: true, ts: Date.now() });
  }

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
        // NOTE: Do NOT emit device_state_changed here. We'll wait for ESP32 confirmations
        // via switch_result/state_update to avoid UI desync.
        // Push commands to ESP32 (raw WS) so physical relays change immediately
    try {
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) {
          for (const sw of device.switches) {
            const payload = { type:'switch_command', mac: device.macAddress, gpio: sw.relayGpio || sw.gpio, state: sw.state, seq: nextCmdSeq(device.macAddress) };
            try {
              logger.info('[hw] switch_command (bulk) push', { mac: device.macAddress, gpio: payload.gpio, state: payload.state, deviceId: device._id.toString() });
            } catch {}
            ws.send(JSON.stringify(payload));
          }
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleSwitches push failed]', e.message);
    }
      }
    }

    // Emit a bulk intent so UI can show pending without flipping state
    try {
      const affectedIds = devices.filter(d => d.switches.some(sw => true)).map(d => d.id);
      req.app.get('io').emit('bulk_switch_intent', { desiredState: state, deviceIds: affectedIds, ts: Date.now() });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleSwitches bulk_switch_intent emit failed]', e.message);
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
        // Do NOT emit device_state_changed here; wait for hardware confirmation
        // Push commands to ESP32 so physical relays reflect type-based bulk change
        try {
          if (global.wsDevices && device.macAddress) {
            const ws = global.wsDevices.get(device.macAddress.toUpperCase());
            if (ws && ws.readyState === 1) {
              for (const sw of device.switches.filter(sw => sw.type === type)) {
                const payload = { type:'switch_command', mac: device.macAddress, gpio: sw.relayGpio || sw.gpio, state: sw.state, seq: nextCmdSeq(device.macAddress) };
                ws.send(JSON.stringify(payload));
              }
            }
          }
        } catch (e) { if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleByType push failed]', e.message); }
      }
    }
    try {
      const ids = devices.map(d => d.id);
      req.app.get('io').emit('bulk_switch_intent', { desiredState: state, deviceIds: ids, filter: { type }, ts: Date.now() });
    } catch {}
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
        // Do NOT emit device_state_changed here; wait for hardware confirmation
        // Push commands to ESP32 so physical relays reflect location-based bulk change
        try {
          if (global.wsDevices && device.macAddress) {
            const ws = global.wsDevices.get(device.macAddress.toUpperCase());
            if (ws && ws.readyState === 1) {
              for (const sw of device.switches) {
                const payload = { type:'switch_command', mac: device.macAddress, gpio: sw.relayGpio || sw.gpio, state: sw.state, seq: nextCmdSeq(device.macAddress) };
                ws.send(JSON.stringify(payload));
              }
            }
          }
        } catch (e) { if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleByLocation push failed]', e.message); }
      }
    }
    try {
      const ids = devices.map(d => d.id);
      req.app.get('io').emit('bulk_switch_intent', { desiredState: state, deviceIds: ids, filter: { location }, ts: Date.now() });
    } catch {}
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
