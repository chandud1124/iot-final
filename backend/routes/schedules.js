
const express = require('express');
const { auth, authorize } = require('../middleware/auth');
const Schedule = require('../models/Schedule');
const scheduleService = require('../services/scheduleService');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Get all schedules
router.get('/', async (req, res) => {
  try {
    const schedules = await Schedule.find()
      .populate('createdBy', 'name email')
      .populate('switches.deviceId', 'name location classroom');
    
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create schedule
router.post('/', authorize('admin', 'faculty'), async (req, res) => {
  try {
    const schedule = await Schedule.create({
      ...req.body,
      createdBy: req.user.id
    });

    scheduleService.addSchedule(schedule);

    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update schedule
router.put('/:id', authorize('admin', 'faculty'), async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    scheduleService.updateSchedule(schedule);

    res.json({ success: true, data: schedule });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete schedule
router.delete('/:id', authorize('admin', 'faculty'), async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    scheduleService.removeJob(req.params.id);

    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
