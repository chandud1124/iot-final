const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { auth, authorize } = require('../middleware/auth');
const { sendTempPasswordEmail, sendPasswordChangedEmail } = require('../services/emailService');
const crypto = require('crypto');

// All user routes require authentication
router.use(auth);

// Helper to sanitize user objects
const toClientUser = (u) => ({
  id: u._id,
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  accessLevel: u.accessLevel,
  assignedDevices: u.assignedDevices || [],
  isActive: u.isActive,
  lastLogin: u.lastLogin
});

// GET /api/users - list users with optional pagination & search (admin)
// Query params: page (1-based), limit, search (matches name/email)
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const search = (req.query.search || '').toString().trim();
    const filter = search
      ? { $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ] }
      : {};

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      data: users.map(toClientUser),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// POST /api/users - create a new user (admin)
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department, accessLevel } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // If no password provided, generate a temporary one and return it so admin can share
    const tempPassword = password || crypto.randomBytes(5).toString('base64').replace(/[^a-zA-Z0-9]/g,'').slice(0,8);

    const user = await User.create({
      name,
      email,
      password: tempPassword,
      role: role || 'user',
      department,
      accessLevel: accessLevel || 'limited',
      isActive: true,
      firstLoginResetRequired: !password
    });

    const response = { user: toClientUser(user) };
    if (!password) {
      response.tempPassword = tempPassword;
      // fire-and-forget email
      sendTempPasswordEmail(email, tempPassword).catch(()=>{});
    }
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Self-service routes BEFORE parameterized ObjectId routes to avoid conflicts
// PATCH /api/users/me/password - self-service password change (auth user)
router.patch('/me/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const match = await user.matchPassword(currentPassword);
    if (!match) return res.status(401).json({ message: 'Current password incorrect' });
    user.password = newPassword;
    user.firstLoginResetRequired = false;
    await user.save();
    sendPasswordChangedEmail(user.email).catch(()=>{});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error changing password' });
  }
});

// GET /api/users/me/flags - return forced-reset flag
router.get('/me/flags', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('firstLoginResetRequired');
    res.json({ firstLoginResetRequired: user ? user.firstLoginResetRequired : false });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching flags' });
  }
});

const objectIdPattern = '([0-9a-fA-F]{24})';

// GET single user (admin)
router.get('/:id('+objectIdPattern+')', authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(toClientUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// PUT /api/users/:id - replace/update user (admin)
router.put('/:id('+objectIdPattern+')', authorize('admin'), async (req, res) => {
  try {
  const allowed = ['name','email','role','department','accessLevel','assignedDevices','isActive'];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    if (update.email) {
      const existing = await User.findOne({ email: update.email, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (process.env.NODE_ENV !== 'production') {
      console.log('[users:update] updated', req.params.id, update);
    }
    res.json(toClientUser(user));
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[users:update] error', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});

// PATCH /api/users/:id/status - toggle active status (admin) (cannot deactivate self)
router.options('/:id('+objectIdPattern+')/status', (req, res) => {
  // Ensure PATCH explicitly present for preflight
  res.set({ 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' });
  return res.sendStatus(204);
});

// POST fallback for status toggle (some environments block PATCH) - body: { isActive: boolean }
router.post('/:id('+objectIdPattern+')/status', authorize('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean required' });
    }
    if (req.user.id === req.params.id && isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (process.env.NODE_ENV !== 'production') console.log('[users:status:POST] set', req.params.id, 'isActive=', isActive);
    res.json(toClientUser(user));
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[users:status:POST] error', error.message || error);
    res.status(500).json({ message: 'Error updating status' });
  }
});

router.patch('/:id('+objectIdPattern+')/status', authorize('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean required' });
    }
    if (req.user.id === req.params.id && isActive === false) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
  if (process.env.NODE_ENV !== 'production') console.log('[users:status] set', req.params.id, 'isActive=', isActive);
    res.json(toClientUser(user));
  } catch (error) {
  if (process.env.NODE_ENV !== 'production') console.error('[users:status] error', error.message || error);
    res.status(500).json({ message: 'Error updating status' });
  }
});

// DELETE /api/users/:id - delete user (admin) cannot delete self
router.delete('/:id('+objectIdPattern+')', authorize('admin'), async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// PATCH /api/users/:id/password - admin sets/resets a user's password
router.patch('/:id('+objectIdPattern+')/password', authorize('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = password; // pre-save hook will hash
    user.firstLoginResetRequired = false;
    await user.save();
    sendPasswordChangedEmail(user.email).catch(()=>{});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error updating password' });
  }
});

module.exports = router;
