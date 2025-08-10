
const express = require('express');
const { auth, authorize, checkDeviceAccess } = require('../middleware/auth');
const { validateDevice } = require('../middleware/deviceValidator');
const { bulkToggleByType, bulkToggleByLocation } = require('../controllers/deviceController');
const {
  getAllDevices,
  createDevice,
  toggleSwitch,
  getDeviceStats,
  updateDevice,
  deleteDevice,
  getDeviceById
} = require('../controllers/deviceController');

const router = express.Router();

// All routes require authentication
router.use(auth);

// Device Routes with validation and proper error handling
router.get('/', getAllDevices);
// Restrict creation strictly to admin
router.post('/', authorize('admin'), validateDevice, createDevice);
router.post('/bulk-toggle', authorize('admin', 'faculty'), (req, res, next) => {
  // simple body validation
  if (typeof req.body.state !== 'boolean') {
    return res.status(400).json({ message: 'state boolean required' });
  }
  next();
}, require('../controllers/deviceController').bulkToggleSwitches);

// Bulk toggle by type
router.post('/bulk-toggle/type/:type', authorize('admin', 'faculty'), (req, res, next) => {
  if (typeof req.body.state !== 'boolean') {
    return res.status(400).json({ message: 'state boolean required' });
  }
  next();
}, bulkToggleByType);

// Bulk toggle by location
router.post('/bulk-toggle/location/:location', authorize('admin', 'faculty'), (req, res, next) => {
  if (typeof req.body.state !== 'boolean') {
    return res.status(400).json({ message: 'state boolean required' });
  }
  next();
}, bulkToggleByLocation);
router.get('/stats', getDeviceStats);

// Single device operations
router.get('/:deviceId', checkDeviceAccess, getDeviceById);
router.put('/:deviceId', authorize('admin', 'faculty'), checkDeviceAccess, validateDevice, updateDevice);
router.delete('/:deviceId', authorize('admin'), checkDeviceAccess, deleteDevice);

// Switch operations
router.post('/:deviceId/switches/:switchId/toggle', checkDeviceAccess, toggleSwitch);

module.exports = router;
