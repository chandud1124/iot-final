const socketIo = require('socket.io');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const { wsLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../middleware/logger');

class SocketService {
    constructor(io) {
        this.io = io;
        this.connectedClients = new Map();
        this.setupSocketEvents();
    }

    setupSocketEvents() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on('authenticate', (token) => {
                // Here you would verify the token and store the authenticated socket
                this.connectedClients.set(socket.id, { socket, authenticated: true });
            });

            socket.on('subscribe:device', (deviceId) => {
                socket.join(`device:${deviceId}`);
            });

            socket.on('unsubscribe:device', (deviceId) => {
                socket.leave(`device:${deviceId}`);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                this.connectedClients.delete(socket.id);
            });
        });
    }

    broadcastDeviceUpdate(deviceId, update) {
        this.io.to(`device:${deviceId}`).emit('device:update', {
            deviceId,
            ...update
        });
    }

    notifyError(deviceId, error) {
        this.io.to(`device:${deviceId}`).emit('device:error', {
            deviceId,
            error
        });
    }

    broadcastStatusChange(deviceId, status) {
        this.io.to(`device:${deviceId}`).emit('device:status', {
            deviceId,
            status
        });
    }
}

module.exports = SocketService;
