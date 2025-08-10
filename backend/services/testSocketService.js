const socketIo = require('socket.io');

class TestSocketService {
    constructor(namespace) {
        this.io = namespace;
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // Handle test message
            socket.on('test_message', (data) => {
                console.log('Test message received:', data);
                socket.emit('test_event', {
                    message: 'Message received!',
                    originalData: data,
                    timestamp: new Date().toISOString()
                });
            });

            // Handle device commands
            socket.on('device_command', (data) => {
                console.log('Device command received:', data);
                
                // Simulate device state change after 1 second
                setTimeout(() => {
                    this.io.emit('device_state_changed', {
                        deviceId: data.deviceId,
                        state: {
                            switches: [{
                                id: data.command.switchId,
                                state: Math.random() > 0.5 // Random state
                            }],
                            lastUpdated: new Date().toISOString()
                        }
                    });
                }, 1000);

                // Simulate PIR trigger after 2 seconds
                setTimeout(() => {
                    this.io.emit('device_pir_triggered', {
                        deviceId: data.deviceId,
                        triggered: true,
                        timestamp: new Date().toISOString()
                    });
                }, 2000);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
    }

    // Method to broadcast a test message to all clients
    broadcastTest(message) {
        this.io.emit('test_event', {
            message,
            timestamp: new Date().toISOString()
        });
    }
}

module.exports = TestSocketService;
