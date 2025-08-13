
const cron = require('node-cron');
const Schedule = require('../models/Schedule');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const SecurityAlert = require('../models/SecurityAlert');
const calendarService = require('./calendarService');

class ScheduleService {
  constructor() {
    this.jobs = new Map();
  // Per-device command sequence for deterministic ordering
  this._cmdSeqMap = new Map(); // mac -> last seq
    this.init();
  }

  async init() {
    console.log('Initializing Schedule Service...');
    await this.loadSchedules();
  }

  async loadSchedules() {
    try {
      const schedules = await Schedule.find({ enabled: true });
      
      for (const schedule of schedules) {
        this.createCronJob(schedule);
      }
      
      console.log(`Loaded ${schedules.length} active schedules`);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }

  nextCmdSeq(mac) {
    if (!mac) return 0;
    const key = mac.toUpperCase();
    const prev = this._cmdSeqMap.get(key) || 0;
    const next = prev + 1;
    this._cmdSeqMap.set(key, next);
    return next;
  }

  _emitDeviceStateChanged(device, source='schedule') {
    try {
      if (!device) return;
      const payload = { deviceId: device.id || device._id?.toString(), state: device, ts: Date.now(), source };
      if (global.io) global.io.emit('device_state_changed', payload);
    } catch (e) { /* noop */ }
  }

  _dispatchToHardware(device, gpio, desiredState) {
    try {
      if (!device || !device.macAddress) return { sent:false, reason:'no_device_mac' };
      const ws = global.wsDevices ? global.wsDevices.get(device.macAddress.toUpperCase()) : null;
      if (ws && ws.readyState === 1) {
        const payload = { type:'switch_command', mac: device.macAddress, gpio, state: desiredState, seq: this.nextCmdSeq(device.macAddress) };
        ws.send(JSON.stringify(payload));
        return { sent:true, reason:'sent' };
      }
      return { sent:false, reason: ws ? `ws_state_${ws.readyState}` : 'ws_not_found' };
    } catch (e) {
      return { sent:false, reason: 'exception_'+e.message };
    }
  }

  createCronJob(schedule) {
    try {
  const cronPattern = this.getCronPattern(schedule);
      
      if (this.jobs.has(schedule._id.toString())) {
        const existing = this.jobs.get(schedule._id.toString());
        try { if (existing && typeof existing.stop === 'function') existing.stop(); } catch {}
        try { if (existing && typeof existing.destroy === 'function') existing.destroy(); } catch {}
      }

  const job = cron.schedule(cronPattern, async () => {
        await this.executeSchedule(schedule);
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });

  this.jobs.set(schedule._id.toString(), job);
  console.log(`Created cron job for schedule: ${schedule.name} (pattern: ${cronPattern}, tz: Asia/Kolkata)`);
    } catch (error) {
      console.error(`Error creating cron job for schedule ${schedule.name}:`, error);
    }
  }

  getCronPattern(schedule) {
    const [hour, minute] = schedule.time.split(':').map(Number);
    
    switch (schedule.type) {
      case 'daily':
        return `${minute} ${hour} * * *`;
      case 'weekly':
        const days = schedule.days.join(',');
        return `${minute} ${hour} * * ${days}`;
      case 'once':
        return `${minute} ${hour} * * *`;
      default:
        throw new Error('Invalid schedule type');
    }
  }

  async executeSchedule(schedule) {
    try {
      console.log(`Executing schedule: ${schedule.name}`);

      // Check if it's a holiday
      if (schedule.checkHolidays) {
        const holidayCheck = await calendarService.checkIfHoliday(new Date());
        if (holidayCheck.isHoliday) {
          console.log(`Skipping schedule ${schedule.name} due to holiday: ${holidayCheck.name}`);
          return;
        }
      }

      for (const switchRef of schedule.switches) {
        await this.toggleScheduledSwitch(switchRef, schedule);
      }

      // Update last run time
      await Schedule.findByIdAndUpdate(schedule._id, {
        lastRun: new Date()
      });

      // If it's a "once" schedule, disable it
      if (schedule.type === 'once') {
        await Schedule.findByIdAndUpdate(schedule._id, { enabled: false });
        this.removeJob(schedule._id.toString());
      }

    } catch (error) {
      console.error(`Error executing schedule ${schedule.name}:`, error);
    }
  }

  async toggleScheduledSwitch(switchRef, schedule) {
    try {
      const device = await Device.findById(switchRef.deviceId);
      if (!device) return;

      const switchIndex = device.switches.findIndex(sw => 
        sw._id.toString() === switchRef.switchId
      );
      
      if (switchIndex === -1) return;

      const switch_ = device.switches[switchIndex];
      
      // Check motion sensor override
      if (schedule.respectMotion && schedule.action === 'off') {
        if (device.pirSensor && device.pirSensor.isActive) {
          // Check if there's recent motion
          const recentActivity = await ActivityLog.findOne({
            deviceId: device._id,
            triggeredBy: 'pir',
            timestamp: {
              $gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes
            }
          });

          if (recentActivity && !switch_.dontAutoOff) {
            // Create security alert instead of turning off
            const alertDoc = await SecurityAlert.create({
              deviceId: device._id,
              deviceName: device.name,
              location: device.location,
              classroom: device.classroom,
              message: `Schedule tried to turn off ${switch_.name} but motion detected. Manual override required.`,
              type: 'motion_override',
              severity: 'medium',
              metadata: {
                switchId: switch_._id.toString(),
                switchName: switch_.name,
                scheduleId: schedule._id.toString(),
                scheduleName: schedule.name
              }
            });
            // Emit websocket security alert event
            if (global.io) {
              global.io.emit('security_alert', {
                id: alertDoc._id,
                deviceId: alertDoc.deviceId,
                deviceName: alertDoc.deviceName,
                location: alertDoc.location,
                classroom: alertDoc.classroom,
                type: alertDoc.type,
                severity: alertDoc.severity,
                message: alertDoc.message,
                metadata: alertDoc.metadata,
                timestamp: alertDoc.createdAt
              });
            }

            console.log(`Motion detected, skipping auto-off for ${switch_.name}`);
            return;
          }
        }
      }

      // Update switch state in DB
      const desiredState = schedule.action === 'on';
      device.switches[switchIndex].state = desiredState;
      await device.save();
      this._emitDeviceStateChanged(device, 'schedule:update_db');

      // Push command to ESP32 if connected, else queue intent for when it comes online
      const gpio = device.switches[switchIndex].relayGpio || device.switches[switchIndex].gpio;
      if (gpio !== undefined) {
        const hw = this._dispatchToHardware(device, gpio, desiredState);
        if (!hw.sent) {
          // Queue intent (replace any existing for same gpio)
          try {
            device.queuedIntents = (device.queuedIntents || []).filter(q => q.switchGpio !== gpio);
            device.queuedIntents.push({ switchGpio: gpio, desiredState, createdAt: new Date() });
            await device.save();
          } catch {}
        }
      }

      // Log activity
      await ActivityLog.create({
        deviceId: device._id,
        deviceName: device.name,
        switchId: switchRef.switchId,
        switchName: switch_.name,
        action: schedule.action,
        triggeredBy: 'schedule',
        classroom: device.classroom,
        location: device.location,
        metadata: {
          scheduleId: schedule._id.toString(),
          scheduleName: schedule.name
        }
      });

      // Set timeout for auto-off if specified
      if (schedule.action === 'on' && schedule.timeoutMinutes > 0) {
        setTimeout(async () => {
          await this.autoOffSwitch(device._id, switchRef.switchId, schedule.timeoutMinutes);
        }, schedule.timeoutMinutes * 60 * 1000);
      }

      console.log(`${schedule.action.toUpperCase()} ${switch_.name} in ${device.name}`);
    } catch (error) {
      console.error('Error toggling scheduled switch:', error);
    }
  }

  async autoOffSwitch(deviceId, switchId, timeoutMinutes) {
    try {
      const device = await Device.findById(deviceId);
      if (!device) return;

      const switchIndex = device.switches.findIndex(sw => 
        sw._id.toString() === switchId
      );
      
      if (switchIndex === -1 || !device.switches[switchIndex].state) return;

      // Check if switch is marked as don't auto-off
      if (device.switches[switchIndex].dontAutoOff) {
        // Create security alert for long running switch
        const alertDoc = await SecurityAlert.create({
          deviceId: device._id,
          deviceName: device.name,
          location: device.location,
          classroom: device.classroom,
          message: `${device.switches[switchIndex].name} has been running for ${timeoutMinutes} minutes and needs manual attention.`,
          type: 'timeout',
          severity: 'high',
          metadata: {
            switchId: switchId,
            switchName: device.switches[switchIndex].name,
            duration: timeoutMinutes
          }
        });
        if (global.io) {
          global.io.emit('security_alert', {
            id: alertDoc._id,
            deviceId: alertDoc.deviceId,
            deviceName: alertDoc.deviceName,
            location: alertDoc.location,
            classroom: alertDoc.classroom,
            type: alertDoc.type,
            severity: alertDoc.severity,
            message: alertDoc.message,
            metadata: alertDoc.metadata,
            timestamp: alertDoc.createdAt
          });
        }
        return;
      }

      // Turn off switch in DB
      device.switches[switchIndex].state = false;
      await device.save();
      this._emitDeviceStateChanged(device, 'schedule:auto_off_db');

      // Dispatch OFF to hardware or queue if offline
      const gpio = device.switches[switchIndex].relayGpio || device.switches[switchIndex].gpio;
      if (gpio !== undefined) {
        const hw = this._dispatchToHardware(device, gpio, false);
        if (!hw.sent) {
          try {
            device.queuedIntents = (device.queuedIntents || []).filter(q => q.switchGpio !== gpio);
            device.queuedIntents.push({ switchGpio: gpio, desiredState: false, createdAt: new Date() });
            await device.save();
          } catch {}
        }
      }

      // Log activity
      await ActivityLog.create({
        deviceId: device._id,
        deviceName: device.name,
        switchId: switchId,
        switchName: device.switches[switchIndex].name,
        action: 'off',
        triggeredBy: 'system',
        classroom: device.classroom,
        location: device.location,
        metadata: {
          reason: 'timeout',
          timeoutMinutes: timeoutMinutes
        }
      });

    } catch (error) {
      console.error('Error in auto-off switch:', error);
    }
  }

  addSchedule(schedule) {
    this.createCronJob(schedule);
  }

  removeJob(scheduleId) {
    if (this.jobs.has(scheduleId)) {
  const existing = this.jobs.get(scheduleId);
  try { if (existing && typeof existing.stop === 'function') existing.stop(); } catch {}
  try { if (existing && typeof existing.destroy === 'function') existing.destroy(); } catch {}
      this.jobs.delete(scheduleId);
      console.log(`Removed cron job for schedule: ${scheduleId}`);
    }
  }

  updateSchedule(schedule) {
    this.removeJob(schedule._id.toString());
    if (schedule.enabled) {
      this.createCronJob(schedule);
    }
  }
}

module.exports = new ScheduleService();
