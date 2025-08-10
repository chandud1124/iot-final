
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Let CORS preflight through early
    if (req.method === 'OPTIONS') {
      return next(); // Let CORS middleware handle preflight
    }
    // Check for token in various places
    const token = 
      req.header('Authorization')?.replace('Bearer ', '') || 
      req.body.token || 
      req.query.token || 
      req.headers['x-access-token'];
    
    if (!token) {
      return res.status(401).json({ 
        message: 'No token, authorization denied',
        code: 'NO_TOKEN' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'User account is disabled',
        code: 'ACCOUNT_DISABLED'
      });
    }

    req.user = user;
    next();
  } catch (error) {
  if (process.env.NODE_ENV !== 'production') console.error('[auth] token error', error.message);
  res.status(401).json({ message: 'Token is not valid' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role ${req.user.role} is not authorized to access this resource` 
      });
    }

    next();
  };
};

const checkDeviceAccess = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    
    if (req.user.role === 'admin') {
      return next();
    }
    
    if (req.user.assignedDevices.includes(deviceId)) {
      return next();
    }
    
    return res.status(403).json({ message: 'Access denied to this device' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during access check' });
  }
};

module.exports = { auth, authorize, checkDeviceAccess };
