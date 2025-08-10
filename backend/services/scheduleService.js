
const cron = require('node-cron');
const Schedule = require('../models/Schedule');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const SecurityAlert = require('../models/SecurityAlert');
const calendarService = require('./calendarService');

class ScheduleService {
  constructor() {
    this.jobs = new Map();
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

  createCronJob(schedule) {
    try {
      const cronPattern = this.getCronPattern(schedule);
      
      if (this.jobs.has(schedule._id.toString())) {
        this.jobs.get(schedule._id.toString()).destroy();
      }

      const job = cron.schedule(cronPattern, async () => {
        await this.executeSchedule(schedule);
      }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
      });

      this.jobs.set(schedule._id.toString(), job);
      console.log(`Created cron job for schedule: ${schedule.name}`);
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

      // Update switch state
      device.switches[switchIndex].state = schedule.action === 'on';
      await device.save();

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

      // Turn off switch
      device.switches[switchIndex].state = false;
      await device.save();

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
      this.jobs.get(scheduleId).destroy();
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
