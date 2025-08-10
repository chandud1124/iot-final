const rateLimit = require('express-rate-limit');
const { logger } = require('../middleware/logger');

// Helper function to log rate limit hits
const logRateLimitHit = (req, res) => {
    logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        userId: req.user?.id,
        headers: req.headers
    });
};

// Authentication rate limiter - Balanced for development
const authLimiter = rateLimit({
    windowMs: (process.env.RATE_LIMIT_WINDOW ? parseInt(process.env.RATE_LIMIT_WINDOW) : 15) * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 1000,
    message: {
        error: 'Too many authentication attempts',
        details: 'Please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (r) => r.ip + ':' + r.path,
    handler: (r, s) => {
        logRateLimitHit(r, s);
        s.status(429).json({
            error: 'Too many authentication attempts',
            details: 'Please wait 15 minutes before trying again'
        });
    }
});

// General API rate limiter - Relaxed for development
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: process.env.NODE_ENV === 'production' ? 100 : 1000000, // Essentially unlimited in development
    message: {
        error: 'Too many API requests',
        details: 'Please slow down your requests'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development', // Skip rate limiting in development
    handler: (req, res) => {
        logRateLimitHit(req, res);
        res.status(429).json({
            error: 'Too many API requests',
            details: 'Please slow down your requests',
            retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
    }
});

// WebSocket rate limiter (for socket events)
const wsLimiter = {
    windowMs: 1000, // 1 second
    max: 50, // 50 events per second
    counter: new Map(),
    check: function(socketId) {
        const now = Date.now();
        const counter = this.counter.get(socketId) || { count: 0, timestamp: now };
        
        if (now - counter.timestamp > this.windowMs) {
            counter.count = 1;
            counter.timestamp = now;
        } else {
            counter.count++;
        }
        
        this.counter.set(socketId, counter);
        return counter.count <= this.max;
    }
};

// Clean up expired WebSocket rate limit entries
setInterval(() => {
    const now = Date.now();
    for (const [socketId, counter] of wsLimiter.counter.entries()) {
        if (now - counter.timestamp > wsLimiter.windowMs) {
            wsLimiter.counter.delete(socketId);
        }
    }
}, 60000); // Clean up every minute

module.exports = {
    authLimiter,
    apiLimiter,
    wsLimiter
};
