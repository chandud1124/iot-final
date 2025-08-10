const socketIo = require('socket.io');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

class ESP32SocketService {
    constructor(namespace) {
        this.io = namespace;
        this.deviceSockets = new Map(); // Map to store device connections
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('ESP32 device attempting to connect...');

            // Send initial welcome message
            socket.emit('hello', { message: 'Welcome ESP32 device' });

            // Handle device authentication
            socket.on('authenticate', async (data) => {
                try {
                    const { macAddress } = data;
                    if (!macAddress) {
                        socket.emit('auth_error', { message: 'MAC address is required' });
                        socket.disconnect();
                        return;
                    }

                    // Find device in database
                    const device = await Device.findOne({ macAddress });
                    if (!device) {
                        socket.emit('auth_error', { message: 'Device not registered' });
                        socket.disconnect();
                        return;
                    }

                    // Store socket connection
                    this.deviceSockets.set(macAddress, socket);
                    socket.deviceData = { macAddress, deviceId: device._id };

                    // Update device status
                    await Device.findByIdAndUpdate(device._id, { 
                        status: 'online',
                        lastSeen: new Date(),
                        ipAddress: socket.handshake.address
                    });

                    console.log(`ESP32 device ${macAddress} authenticated and connected`);
                    socket.emit('authenticated');

                    // Log activity
                    await ActivityLog.create({
                        deviceId: device._id,
                        deviceName: device.name,
                        action: 'connected',
                        triggeredBy: 'device',
                        ip: socket.handshake.address
                    });

                    // Setup device-specific handlers
                    this.setupDeviceHandlers(socket, device);

                } catch (error) {
                    console.error('Authentication error:', error);
                    socket.emit('auth_error', { message: 'Authentication failed' });
                    socket.disconnect();
                }
            });
        });
    }

    setupDeviceHandlers(socket, device) {
        // Handle state updates from device
        socket.on('state_update', async (data) => {
            try {
                const { switches, pirState } = data;
                
                // Update device state in database
                const updatedDevice = await Device.findByIdAndUpdate(
                    device._id,
                    {
                        'switches': switches,
                        'pirEnabled': pirState?.enabled || device.pirEnabled,
                        lastSeen: new Date()
                    },
                    { new: true }
                );

                // Broadcast state change to all connected clients
                this.io.emit('device_state_changed', {
                    deviceId: device._id,
                    state: updatedDevice
                });

            } catch (error) {
                console.error('Error handling state update:', error);
                socket.emit('error', { message: 'Failed to update state' });
            }
        });

        // Handle PIR sensor events
        socket.on('pir_triggered', async (data) => {
            try {
                const { triggered } = data;
                
                await ActivityLog.create({
                    deviceId: device._id,
                    deviceName: device.name,
                    action: 'pir_triggered',
                    triggeredBy: 'sensor',
                    details: { triggered }
                });

                // Broadcast PIR event to all connected clients
                this.io.emit('device_pir_triggered', {
                    deviceId: device._id,
                    triggered
                });

            } catch (error) {
                console.error('Error handling PIR event:', error);
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            try {
                // Update device status
                await Device.findByIdAndUpdate(device._id, { 
                    status: 'offline',
                    lastSeen: new Date()
                });

                // Remove from connected devices
                this.deviceSockets.delete(socket.deviceData.macAddress);

                // Log disconnect
                await ActivityLog.create({
                    deviceId: device._id,
                    deviceName: device.name,
                    action: 'disconnected',
                    triggeredBy: 'device'
                });

                console.log(`ESP32 device ${socket.deviceData.macAddress} disconnected`);
            } catch (error) {
                console.error('Error handling disconnect:', error);
            }
        });
    }

    // Method to send command to specific device
    async sendCommand(macAddress, command) {
        const socket = this.deviceSockets.get(macAddress);
        if (!socket) {
            throw new Error('Device not connected');
        }

        return new Promise((resolve, reject) => {
            socket.emit('command', command, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // Method to broadcast command to all devices
    broadcastCommand(command) {
        this.io.emit('command', command);
    }

    // Method to get connected devices
    getConnectedDevices() {
        return Array.from(this.deviceSockets.keys());
    }
}

module.exports = ESP32SocketService;
