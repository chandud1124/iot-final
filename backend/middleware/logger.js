const winston = require('winston');
const { format } = winston;

// Configure Winston logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: format.combine(
            format.colorize(),
            format.simple()
        )
    }));
}

const errorLogger = (err, req, res, next) => {
    const errorDetails = {
        timestamp: new Date().toISOString(),
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack
        },
        request: {
            method: req.method,
            url: req.url,
            body: req.body,
            query: req.query,
            params: req.params,
            headers: {
                ...req.headers,
                authorization: req.headers.authorization ? '[REDACTED]' : undefined
            }
        },
        user: req.user ? {
            id: req.user.id,
            email: req.user.email
        } : null
    };

    // Log error details
    logger.error('API Error:', errorDetails);

    // Send appropriate response
    const statusCode = err.statusCode || 500;
    const response = {
        error: true,
        message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
        code: err.code || 'INTERNAL_ERROR',
        timestamp: errorDetails.timestamp
    };

    if (process.env.NODE_ENV !== 'production') {
        response.details = errorDetails;
    }

    res.status(statusCode).json(response);
};

module.exports = { errorLogger, logger };
