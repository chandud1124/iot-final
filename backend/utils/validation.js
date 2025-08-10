const { body } = require('express-validator');

// Reusable validation patterns
const patterns = {
    macAddress: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
    ipAddress: /^(\d{1,3}\.){3}\d{1,3}$/,
    email: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/,
    password: /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/
};

// Common validation rules
const commonValidations = {
    name: body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2 }).withMessage('Name must be at least 2 characters long')
        .isLength({ max: 100 }).withMessage('Name must be less than 100 characters'),

    email: body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .matches(patterns.email).withMessage('Invalid email format')
        .normalizeEmail(),

    password: body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
        .matches(patterns.password)
        .withMessage('Password must contain at least one letter, one number, and one special character'),

    macAddress: body('macAddress')
        .trim()
        .notEmpty().withMessage('MAC address is required')
        .matches(patterns.macAddress).withMessage('Invalid MAC address format (XX:XX:XX:XX:XX:XX)'),

    ipAddress: body('ipAddress')
        .optional()
        .trim()
        .matches(patterns.ipAddress).withMessage('Invalid IP address format')
        .custom(value => {
            const parts = value.split('.');
            return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
        }).withMessage('IP address octets must be between 0 and 255'),

    gpio: (field) => body(field)
        .optional()
        .isInt({ min: 0, max: 39 }).withMessage('GPIO pin must be between 0 and 39')
        .custom(value => {
            if ([6, 7, 8, 9, 10, 11].includes(value)) {
                throw new Error('This GPIO pin is reserved for internal use');
            }
            return true;
        })
};

module.exports = {
    patterns,
    commonValidations
};
