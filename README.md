
# Dwell Control - IoT Building Management System

A modern IoT building management system enabling real-time device control, scheduling, security monitoring, and classroom / zone automation. Built with React + TypeScript (Vite), Node.js/Express + MongoDB, and ESP32 devices communicating over a lightweight raw WebSocket channel plus REST API.

## ✨ Features (Current)

### Device Management
- Real-time device control (raw WebSocket push + REST fallbacks)
- Device status & last-seen monitoring
- Manual (physical) switch override support
- Bulk toggle (all / by type / by location / by classroom)
- Master switch grouping
- Location & type based organization

### User Management
- Role-based access control
- User authentication and authorization
- Password reset functionality
- User activity logging

### Scheduling
- Automated device control scheduling
- Holiday scheduling
- Custom recurring schedules
- Schedule override options

### Security
- Motion (PIR) detection integration (edge + server logic)
- Security alerts (extensible) & activity logging
- Role + route authorization & rate limiting
- Planned: offline / after-hours alerting (hooks in place)

### Interface / UX
- Modern responsive dashboard (Tailwind)
- Real-time status updates via Socket.IO broadcast
- Global loading overlay with smart background prefetch
- Navigation prefetch + stale-time caching (reduces latency)
- Mobile sidebar auto-close behavior
- Role-aware UI elements (admin-only device creation)

## 🔧 Technology Stack

### Frontend
- React with TypeScript
- Vite for build tooling
- TailwindCSS for styling
- Radix UI components
- React Query for data fetching
- React Router for navigation

### Backend
- Node.js + Express + MongoDB (Mongoose)
- JWT authentication & role-based middleware
- Socket.IO (browser real-time events: device_state_changed, security_alert)
- Raw WebSocket endpoint (/esp32-ws) for ESP32 devices (lightweight vs Socket.IO)
- REST API (configuration, schedules, management)
- Activity logging & structured middleware (rate limiter, validation)

### IoT Device
- ESP32 (Arduino / PlatformIO)
- Raw WebSocket client (identify, heartbeat, state_update, switch_command)
- Optional REST endpoints (legacy / fallback)
- Manual hardware switch & relay control
- PIR motion sensor events
- (Optional extension) EEPROM / NVS persistence

## 🚀 Quick Start Guide

### 1. First-Time Setup

1. **Clone and Install**
   ```bash
   git clone https://github.com/chandugowdad1124-svg/iot-project.git
   cd iot-project
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```

   Create `.env` file in backend directory:
   ```env
   NODE_ENV=development
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/dwell-control
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=7d

   # Email Configuration (For password reset)
   EMAIL_SERVICE=gmail
   EMAIL_USERNAME=your-email@gmail.com
   EMAIL_PASSWORD=your-app-specific-password
   EMAIL_FROM=your-email@gmail.com
   ```

   **Important**: For EMAIL_PASSWORD, you need to:
   - Enable 2-Step Verification in Google Account
   - Generate App Password: Google Account → Security → App passwords
   - Use the generated 16-character password

3. **Frontend Setup**
   ```bash
   cd ..  # Return to project root
   npm install
   ```

   Create `.env` file in root directory:
   ```env
   VITE_API_BASE_URL=http://localhost:3001/api
   ```

## 🔐 Security Features

1. **API Security**
   - JWT authentication
   - Rate limiting
   - CORS protection
   - Input validation

2. **Device Security**
   - Secure device registration
   - Command validation
   - Activity logging

3. **User Security**
   - Password hashing
   - Role-based access
   - Session management

## 📱 Mobile Support

The web interface is fully responsive and works on:
- Desktop browsers
- Mobile browsers
- Tablets
- Progressive Web App (PWA) support

## 🛠 Troubleshooting

1. **Device Connection Issues**
   - Check WiFi connectivity
   - Verify server address in config
   - Check device logs

2. **Backend Issues**
   - Verify MongoDB connection
   - Check environment variables
   - Review server logs

3. **Frontend Issues**
   - Clear browser cache
   - Check console for errors
   - Verify API endpoint configuration

## 📡 API Endpoints (Highlights)

### Real-time Device Channel (WebSocket)
- Endpoint: `ws://<backend-host>:3001/esp32-ws`
- Messages:
   - Device → Server:
      - `{ "type":"identify", "mac":"AA:BB:CC:DD:EE:FF" }`
      - `{ "type":"heartbeat", "mac":"...", "uptime":123 }`
      - `{ "type":"state_update", "macAddress":"...", "switches":[{"gpio":26,"state":true}] }`
   - Server → Device:
      - `{ "type":"identified", "mac":"..." }`
      - `{ "type":"switch_command", "mac":"...", "gpio":26, "state":false }`

### Legacy / REST Device API (Optional)
- `POST /api/device-api/:deviceId/status`
- `GET /api/device-api/:deviceId/commands`
- `POST /api/device-api/:deviceId/command`

### User Management
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Device Management
- `GET /api/devices` - List all devices
- `POST /api/devices` - Add new device (Admin only)
- `PUT /api/devices/:id` - Update device
- `DELETE /api/devices/:id` - Delete device

### Scheduling
- `GET /api/schedules` - List schedules
- `POST /api/schedules` - Create schedule
- `PUT /api/schedules/:id` - Update schedule
- `DELETE /api/schedules/:id` - Delete schedule

### 2. Starting the Application

1. **Start MongoDB** (if running locally)
   ```bash
   mongod
   ```

2. **Start Backend**
   ```bash
   cd backend
   npm start
   ```

3. **Start Frontend** (in a new terminal)
   ```bash
   # In project root
   npm run dev
   ```

4. Access the application at `http://localhost:5173`

## 🏗️ Architecture Overview

Components:
1. **Frontend** (React + TS): Caches device lists with stale-time; subscribes to Socket.IO for push updates; issues toggle actions via REST.
2. **Backend** (Express): Persists devices & schedules; emits `device_state_changed` after mutations; forwards direct `switch_command` to ESP32 via wsDevices map.
3. **ESP32 Firmware**: Maintains raw WebSocket; sends identify, periodic heartbeat, and state updates when relays change (local or command-driven).

## 🚀 Features

### Dashboard Features
- **Device Management**: Register and configure ESP32 devices
- **Switch Control**: Toggle relays via web interface or manual switches
- **PIR Sensor Integration**: Motion-based automation
- **Real-time Updates**: Bidirectional communication between web and ESP32
- **Scheduling**: Calendar-based automation
- **User Management**: Role-based access (Admin/User)

### ESP32 Integration (Current Minimal Protocol)
- Identify -> Server maps MAC to socket
- Heartbeat every 30s updates `lastSeen`
- State Update includes array of `{ gpio, state }`
- Command: server issues `switch_command` with target gpio & state
- (Optional add-ons) PIR events, extended config fetch, OTA

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- MongoDB 4.4+
- Arduino IDE or PlatformIO for ESP32

### Frontend Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd iot-automation

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Configure environment variables (see .env.example)
# Start development server
npm run dev
```

### Backend Setup
```bash
cd backend/
npm install
cp .env.example .env

# Configure MongoDB URI and other settings in .env
# Start backend server
npm run dev
```

## 👥 Initial System Configuration

1. **First Admin User**
   - Register at `http://localhost:5173/register`
   - First registered user becomes admin automatically
   - Use admin account to manage users and permissions

2. **User Roles and Permissions**
   - **Admin**: Full system access
   - **Faculty**: Device control and scheduling
   - **Security**: Monitor alerts and access
   - **User**: Basic device control

3. **Device Setup**
   - Add devices through admin panel
   - Configure GPIO pins and features
   - Group devices into zones
   - Set up master switches

4. **Scheduling**
   - Create recurring schedules
   - Set up holiday calendar
   - Configure automated rules

## ⚙️ Configuration Details

### Frontend Environment (.env)
```env
VITE_API_BASE_URL=http://localhost:3001/api
```

### Backend Environment (.env)
```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/dwell-control
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USERNAME=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=your-email@gmail.com
```

## 🔧 ESP32 Setup (WebSocket Mode)

### Hardware Configuration
1. **Basic Setup**
   - Connect relay modules to GPIO pins
   - Wire manual switches (optional)
   - Connect PIR sensors (optional)
   - Power up ESP32

2. **Wiring Guide**
   - See `esp32/wiring_guide.md`
   - Keep relay module grounds common with ESP32 ground
   - Use flyback diode if driving coils directly

### Software Configuration
1. **Install Required Libraries**
   ```bash
   # Using PlatformIO
   pio lib install
   # Or check libraries.txt for Arduino IDE
   ```

2. **Configure WiFi / WS**
   Edit `esp32/config.h` or literals in `websocket_example.cpp`:
   ```cpp
   #define WIFI_SSID "YOUR_WIFI" 
   #define WIFI_PASSWORD "YOUR_PASS" 
   #define WEBSOCKET_HOST "192.168.1.50" // backend IP (not 127.0.0.1)
   #define WEBSOCKET_PORT 3001
   #define WEBSOCKET_PATH "/esp32-ws"
   ```

3. **Upload Firmware**
   - Use PlatformIO or Arduino IDE
   - Follow `esp32/setup_instructions.md`

## 🛠️ Troubleshooting

### Common Issues

1. **MongoDB Connection**
   - Ensure MongoDB is running
   - Check connection string
   - Verify network access

2. **Email Service**
   - Confirm Gmail 2FA is enabled
   - Verify App Password
   - Check email service logs

3. **ESP32 Connection**
- Use backend LAN IP (e.g., `ipconfig getifaddr en0` on macOS)
- Confirm WebSocket path: `/esp32-ws`
- Check serial log for `WS connected` & `identified`
- Ensure firewall allows port 3001

4. **Authentication Issues**
   - Check JWT token expiration
   - Verify user credentials
   - Clear browser cache if needed

## 📝 Development Notes

- Run `npm run dev` for development with hot-reload
- Use `npm run build` for production build
- Backend logs are in `backend/logs/`
- Check `esp32/libraries.txt` for required ESP32 libraries

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

### Device Registration Flow (Current)
1. Flash ESP32 with WebSocket firmware (`esp32/websocket_example.cpp` or minimal variant)
2. Watch serial for MAC (e.g., `AA:BB:CC:DD:EE:FF`)
3. In dashboard (Admin role) add device with matching MAC & relay GPIO mapping
4. Toggle in UI -> server saves state & pushes `switch_command` to device
5. Device applies relay change & emits `state_update` (UI updates via broadcast)

## 🌐 Deployment Options

### Local Network (Recommended for IoT)
1. **Raspberry Pi**: Deploy both frontend and backend
2. **Local PC/Server**: Run as Docker containers
3. **Router with OpenWrt**: Host lightweight version

### Cloud Deployment
1. **Frontend**: Vercel, Netlify, or any static hosting
2. **Backend**: Railway, Render, DigitalOcean, AWS EC2
3. **Database**: MongoDB Atlas or self-hosted

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d
```

## 🔐 Security Considerations

- Change default JWT secrets
- Use HTTPS in production
- Configure MongoDB authentication
- Set up proper CORS policies
- Use environment variables for sensitive data
- Regular security updates

## 📡 API Documentation

### ESP32 Endpoints
- `GET /api/device/config/:mac` - Get device configuration
- `POST /api/device/status` - Update device status
- `POST /api/switch/toggle` - Toggle switch state
- `GET /api/schedule/:deviceId` - Get scheduled tasks

### Dashboard API
- `POST /api/auth/login` - User authentication
- `GET /api/devices` - List all devices
- `POST /api/devices` - Register new device
- `PUT /api/devices/:id/gpio` - Configure GPIO pins

## 🛠️ Development

### Project Structure
```
├── src/
│   ├── components/          # React components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom hooks
│   ├── types/              # TypeScript types
│   └── utils/              # Utility functions
├── backend/                # Backend server (to be created)
├── esp32-firmware/         # ESP32 Arduino code (to be created)
└── docs/                   # Documentation
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- Check the documentation
- Review existing issues on GitHub
- Create a new issue with detailed information

## 📄 License

MIT License - see LICENSE file for details
