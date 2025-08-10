const socketIo = require('socket.io');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

class DeviceSocketService {
    constructor(server) {
        this.io = socketIo(server, {
            path: '/device-ws',
            cors: {
                origin: process.env.NODE_ENV === 'production'
                    ? [process.env.FRONTEND_URL]
                    : ['http://localhost:5173', 'http://localhost:5174'],
                credentials: true
            }
        });
        
        this.deviceSockets = new Map();
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Device connecting...');

            // Handle device authentication
            socket.on('authenticate', async (data) => {
                try {
                    const { macAddress } = data;
                    if (!macAddress) {
                        socket.emit('auth_error', { message: 'MAC address is required' });
                        return socket.disconnect();
                    }

                    const device = await Device.findOne({ macAddress });
                    if (!device) {
                        socket.emit('auth_error', { message: 'Device not registered' });
                        return socket.disconnect();
                    }

                    // Store socket connection
                    this.deviceSockets.set(macAddress, socket);
                    socket.deviceData = { macAddress, deviceId: device._id };
                    socket.join(device._id.toString());

                    // Update device status
                    await Device.findByIdAndUpdate(device._id, {
                        status: 'online',
                        lastSeen: new Date(),
                        ipAddress: socket.handshake.address
                    });

                    // Log activity
                    await ActivityLog.create({
                        deviceId: device._id,
                        action: 'DEVICE_CONNECTED',
                        details: `Device ${device.name} connected`
                    });

                    console.log(`Device ${macAddress} authenticated`);
                    socket.emit('authenticated');
                } catch (error) {
                    console.error('Device authentication error:', error);
                    socket.emit('auth_error', { message: 'Authentication failed' });
                    socket.disconnect();
                }
            });

            // Handle state updates from devices
            socket.on('state_update', async (data) => {
                try {
                    const { macAddress, switches } = data;
                    const device = await Device.findOne({ macAddress });
                    
                    if (device) {
                        device.switches = switches;
                        device.lastSeen = new Date();
                        await device.save();

                        // Broadcast state update to all clients
                        this.io.to(device._id.toString()).emit('device_state_updated', {
                            deviceId: device._id,
                            switches: device.switches
                        });
                    }
                } catch (error) {
                    console.error('State update error:', error);
                }
            });

            // Handle disconnect
            socket.on('disconnect', async () => {
                try {
                    if (socket.deviceData) {
                        const { macAddress } = socket.deviceData;
                        this.deviceSockets.delete(macAddress);

                        const device = await Device.findOne({ macAddress });
                        if (device) {
                            await Device.findByIdAndUpdate(device._id, {
                                status: 'offline',
                                lastSeen: new Date()
                            });

                            await ActivityLog.create({
                                deviceId: device._id,
                                action: 'DEVICE_DISCONNECTED',
                                details: `Device ${device.name} disconnected`
                            });
                        }
                    }
                } catch (error) {
                    console.error('Disconnect handling error:', error);
                }
            });
        });
    }

    // Method to send command to a device
    async sendCommand(deviceId, command) {
        try {
            const device = await Device.findById(deviceId);
            if (!device) {
                throw new Error('Device not found');
            }

            const socket = this.deviceSockets.get(device.macAddress);
            if (!socket) {
                throw new Error('Device not connected');
            }

            socket.emit('command', command);
            return true;
        } catch (error) {
            console.error('Send command error:', error);
            throw error;
        }
    }
}

module.exports = DeviceSocketService;
