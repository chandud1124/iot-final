const { logger } = require('./logger');

const routeMonitor = (req, res, next) => {
    const start = Date.now();

    // Log request
    logger.info('Incoming Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Monitor response
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('Request Completed', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`
        });
    });

    next();
};

module.exports = routeMonitor;
