
require('dotenv').config();
const express = require('express');
const path = require('path');
console.log('[startup] Starting server.js ...');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const { logger } = require('./middleware/logger');
const routeMonitor = require('./middleware/routeMonitor');

// Initialize error tracking
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

// Enable request logging
const requestLogger = morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
});
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

// Import routes
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const deviceApiRoutes = require('./routes/deviceApi');
const esp32Routes = require('./routes/esp32');
const scheduleRoutes = require('./routes/schedules');
const userRoutes = require('./routes/users');  // Using the new users route
const activityRoutes = require('./routes/activities');
const securityRoutes = require('./routes/security');
const settingsRoutes = require('./routes/settings');

// Import services (only those actively used)
const scheduleService = require('./services/scheduleService');
// Removed legacy DeviceSocketService/TestSocketService/ESP32SocketService for cleanup

// Import Google Calendar routes
const googleCalendarRoutes = require('./routes/googleCalendar');


// MongoDB Connection with retry logic and fallback (non-fatal if exhausts)
let dbConnected = false;
const connectDB = async (retries = 5) => {
  const primaryUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-automation';
  const fallbackUri = process.env.MONGODB_URI_FALLBACK || process.env.MONGODB_URI_DIRECT; // optional
  const opts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 4000,
    socketTimeoutMS: 45000,
    directConnection: primaryUri.startsWith('mongodb://') ? true : undefined,
  };
  try {
    await mongoose.connect(primaryUri, opts);
    dbConnected = true;
    logger.info('Connected to MongoDB');
    try {
      await createAdminUser();
    } catch (adminError) {
      logger.error('Admin user creation error:', adminError);
    }
  } catch (err) {
    const msg = err && (err.message || String(err));
    logger.error('MongoDB connection error (continuing in LIMITED MODE):', msg);
    // If SRV lookup fails or DNS issues occur and a fallback URI is provided, try it once per attempt
    const isSrvIssue = /querySrv|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(msg || '');
    if (fallbackUri && isSrvIssue) {
      try {
        logger.warn('Trying fallback MongoDB URI...');
        await mongoose.connect(fallbackUri, {
          ...opts,
          directConnection: true,
        });
        dbConnected = true;
        logger.info('Connected to MongoDB via fallback URI');
        try { await createAdminUser(); } catch (adminError) { logger.error('Admin user creation error:', adminError); }
        return;
      } catch (fallbackErr) {
        logger.error('Fallback MongoDB URI connection failed:', fallbackErr.message || fallbackErr);
      }
    }
    if (retries > 0) {
      logger.info(`Retrying connection... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB(retries - 1);
    } else {
      logger.warn('MongoDB not connected. API running in LIMITED MODE (DB-dependent routes may fail).');
    }
  }
};

connectDB().catch(()=>{});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err);
});

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Manual preflight handler (before cors) to guarantee PATCH visibility
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const devOrigins = ['http://localhost:5173','http://localhost:5174','http://localhost:5175'];
    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [process.env.FRONTEND_URL || 'https://your-frontend-domain.com']
      : devOrigins;
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');
  // Silenced verbose preflight logging
    return res.status(204).end();
  }
  next();
});

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://your-frontend-domain.com']
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));



// Body parser (single instance)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize main Socket.IO instance
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [process.env.FRONTEND_URL || 'https://your-frontend-domain.com']
      : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  },
  // Try disabling per-message deflate to rule out frame corruption
  perMessageDeflate: false,
  allowEIO3: false
});

io.engine.on('connection_error', (err) => {
  logger.error('[engine] connection_error', {
    code: err.code,
    message: err.message,
    context: err.context
  });
});

// Log unexpected upgrade attempts that may corrupt websocket frames
server.on('upgrade', (req, socket) => {
  const url = req.url || '';
  if (url.startsWith('/socket.io/') || url.startsWith('/esp32-ws')) return; // expected, handled elsewhere
  logger.warn('[upgrade] unexpected websocket upgrade path', { url });
  // Do not write to socket, just let it close if not handled
});

// Additional low-level Engine.IO diagnostics to help trace "Invalid frame header" issues
// These logs are lightweight and only emit on meta events (not every packet) unless NODE_ENV=development
io.engine.on('initial_headers', (headers, req) => {
  logger.info('[engine] initial_headers', {
    ua: req.headers['user-agent'],
    url: req.url
  });
});
io.engine.on('headers', (headers, req) => {
  // This fires on each HTTP long‑polling request; keep it quiet in production
  if (process.env.NODE_ENV === 'development') {
    logger.debug('[engine] headers', { transport: req._query && req._query.transport, sid: req._query && req._query.sid });
  }
});
io.engine.on('connection', (rawSocket) => {
  logger.info('[engine] connection', { id: rawSocket.id, transport: rawSocket.transport.name });
  rawSocket.on('upgrade', (newTransport) => {
    logger.info('[engine] transport upgrade', { id: rawSocket.id, from: rawSocket.transport.name, to: newTransport && newTransport.name });
  });
  rawSocket.on('transport', (t) => {
    logger.info('[engine] transport set', { id: rawSocket.id, transport: t && t.name });
  });
  rawSocket.on('close', (reason) => {
    logger.info('[engine] connection closed', { id: rawSocket.id, reason });
  });
});

// (Removed old namespace socket services)

// Rate limiting - Very permissive for development
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' 
    ? (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100)  // 100 requests per minute in production
    : 1000000,  // Essentially unlimited in development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting only in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

// (removed duplicate simple health route; see consolidated one below)

// Mount routes with rate limiting
const apiRouter = express.Router();

// Apply rate limiting only to sensitive auth mutation endpoints (not profile)
apiRouter.use('/auth/register', authLimiter);
apiRouter.use('/auth/login', authLimiter);
apiRouter.use('/auth/forgot-password', authLimiter);
apiRouter.use('/auth/reset-password', authLimiter);
apiRouter.use('/auth', authRoutes);

// Apply API rate limiting to other routes
apiRouter.use('/bulk', apiLimiter, require('./routes/bulk'));
apiRouter.use('/helper', apiLimiter, require('./routes/helper'));
apiRouter.use('/devices', apiLimiter, deviceRoutes);
apiRouter.use('/device-api', apiLimiter, deviceApiRoutes);
apiRouter.use('/esp32', apiLimiter, esp32Routes);
apiRouter.use('/schedules', apiLimiter, scheduleRoutes);
apiRouter.use('/users', apiLimiter, userRoutes);
apiRouter.use('/activities', apiLimiter, activityRoutes);
apiRouter.use('/security', apiLimiter, securityRoutes);
apiRouter.use('/settings', apiLimiter, settingsRoutes);
// Google Calendar routes (primary path + legacy alias)
apiRouter.use('/google-calendar', apiLimiter, googleCalendarRoutes);
apiRouter.use('/calendar', apiLimiter, googleCalendarRoutes); // legacy alias

// Mount all routes under /api
app.use('/api', apiRouter);

// Optional same-origin static serving (set SERVE_FRONTEND=1 after building frontend into ../dist)
try {
  if (process.env.SERVE_FRONTEND === '1') {
    const distPath = path.join(__dirname, '..', 'dist');
    const fs = require('fs');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
      logger.info('[static] Serving frontend dist/ assets same-origin');
    } else {
      logger.warn('[static] SERVE_FRONTEND=1 but dist folder not found at', distPath);
    }
  }
} catch (e) {
  logger.error('[static] error enabling same-origin serving', e.message);
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}


// Create default admin user
const createAdminUser = async () => {
  try {
    const User = require('./models/User');
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (!existingAdmin) {
      // IMPORTANT: Provide the plain password here so the pre-save hook hashes it ONCE.
      // Previously this code hashed manually AND the pre-save hook re-hashed, breaking login.
      await User.create({
        name: process.env.ADMIN_NAME || 'System Administrator',
        email: process.env.ADMIN_EMAIL || 'admin@college.edu',
        password: process.env.ADMIN_PASSWORD || 'admin123456',
        role: 'admin',
        department: 'IT Department',
        accessLevel: 'full'
      });
      logger.info('Default admin user created (single-hash)');
    }
  } catch (error) {
    logger.error('Error creating admin user:', error);
  }
};

// Socket.IO for real-time updates with additional diagnostics
io.engine.on('connection_error', (err) => {
  logger.error('[socket.io engine connection_error]', {
    code: err.code,
    message: err.message,
    context: err.context
  });
});

io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);
  // Emit a hello for quick handshake debug
  socket.emit('server_hello', { ts: Date.now() });

  socket.on('join-room', (room) => {
    try {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room ${room}`);
    } catch (e) {
      logger.error('[join-room error]', e.message);
    }
  });

  socket.on('ping_test', (cb) => {
    if (typeof cb === 'function') cb({ pong: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected:', socket.id, 'reason:', reason);
  });
});

// Make io accessible to routes and globally (for services without req)
app.set('io', io);
global.io = io;
// Expose sequence-aware emitter to controllers
app.set('emitDeviceStateChanged', emitDeviceStateChanged);

// -----------------------------------------------------------------------------
// Device state sequencing & unified emit helper
// -----------------------------------------------------------------------------
// Adds a monotonically increasing per-device sequence number to every
// device_state_changed event for deterministic ordering + easier debug of
// stale/ out-of-order UI updates.
const deviceSeqMap = new Map(); // deviceId -> last seq
function nextDeviceSeq(deviceId) {
  const prev = deviceSeqMap.get(deviceId) || 0;
  const next = prev + 1;
  deviceSeqMap.set(deviceId, next);
  return next;
}

function emitDeviceStateChanged(device, meta = {}) {
  if (!device) return;
  const deviceId = device.id || device._id?.toString();
  if (!deviceId) return;
  const seq = nextDeviceSeq(deviceId);
  const payload = {
    deviceId,
    state: device,
    ts: Date.now(),
    seq,
    source: meta.source || 'unknown',
    note: meta.note
  };
  io.emit('device_state_changed', payload);
  // Focused debug log (avoid dumping entire device doc unless explicitly enabled)
  if (process.env.DEVICE_SEQ_LOG === 'verbose') {
    logger.info('[emitDeviceStateChanged]', { deviceId, seq, source: payload.source, note: payload.note });
  } else if (process.env.DEVICE_SEQ_LOG === 'basic') {
    logger.debug('[emitDeviceStateChanged]', { deviceId, seq, source: payload.source });
  }
}

// -----------------------------------------------------------------------------
// Raw WebSocket server for ESP32 devices (simpler than Socket.IO on microcontroller)
const wsDevices = new Map(); // mac -> ws
global.wsDevices = wsDevices;
const wss = new WebSocketServer({ server, path: '/esp32-ws' });
logger.info('Raw WebSocket /esp32-ws endpoint ready');

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', async (msg) => {
    let data;
    try { data = JSON.parse(msg.toString()); } catch { return; }
    const type = data.type;
    if (type === 'identify' || type === 'authenticate') {
      const mac = (data.mac || data.macAddress || '').toUpperCase();
      const secret = data.secret || data.signature;
      if (!mac) {
        ws.send(JSON.stringify({ type:'error', reason:'missing_mac' }));
        return;
      }
      try {
        const Device = require('./models/Device');
        // fetch secret field explicitly
        const device = await Device.findOne({ macAddress: mac }).select('+deviceSecret switches macAddress');
        if (!device || !device.deviceSecret) {
          // If deviceSecret not set, allow temporary identification without secret
          if (!device) {
            logger.warn('[identify] device_not_registered', { mac });
            ws.send(JSON.stringify({ type:'error', reason:'device_not_registered' }));
            try { io.emit('identify_error', { mac, reason: 'device_not_registered' }); } catch {}
            return;
          }
        } else if (!secret || device.deviceSecret !== secret) {
          if (process.env.ALLOW_INSECURE_IDENTIFY === '1') {
            logger.warn('[identify] secret mismatch but ALLOW_INSECURE_IDENTIFY=1, allowing temporary identify', { mac });
          } else {
            logger.warn('[identify] invalid_or_missing_secret', { mac, provided: secret ? 'present' : 'missing' });
            ws.send(JSON.stringify({ type:'error', reason:'invalid_or_missing_secret' }));
            try { io.emit('identify_error', { mac, reason: 'invalid_or_missing_secret' }); } catch {}
            return;
          }
        }
  ws.mac = mac;
  // Attach secret for this connection (if available)
  ws.secret = (device && device.deviceSecret) ? device.deviceSecret : undefined;
        wsDevices.set(mac, ws);
        device.status = 'online';
        device.lastSeen = new Date();
        await device.save();
        if (process.env.NODE_ENV !== 'production') {
          console.log('[identify] device marked online', { mac, lastSeen: device.lastSeen.toISOString() });
        }
        // Flush any queued intents
        if (Array.isArray(device.queuedIntents) && device.queuedIntents.length) {
          for (const intent of device.queuedIntents) {
            try {
              const payload = { type: 'switch_command', mac, gpio: intent.switchGpio, state: intent.desiredState };
              ws.send(JSON.stringify(payload));
            } catch (e) { /* ignore individual failures */ }
          }
          device.queuedIntents = [];
          await device.save();
        }
        // Build minimal switch config (exclude sensitive/internal fields)
        const switchConfig = Array.isArray(device.switches) ? device.switches.map(sw => ({
          gpio: sw.gpio,
          relayGpio: sw.relayGpio,
          name: sw.name,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualSwitchEnabled: sw.manualSwitchEnabled,
          manualMode: sw.manualMode,
          manualActiveLow: sw.manualActiveLow,
          state: sw.state
        })) : [];
        ws.send(JSON.stringify({
          type: 'identified',
            mac,
            mode: device.deviceSecret ? 'secure' : 'insecure',
            switches: switchConfig
        }));
        // Immediately send a full config_update so firmware can apply current states and GPIO mapping
        try {
          const cfgMsg = {
            type: 'config_update',
            mac,
            switches: device.switches.map((sw, idx) => ({
              order: idx,
              gpio: sw.gpio,
              relayGpio: sw.relayGpio,
              name: sw.name,
              manualSwitchGpio: sw.manualSwitchGpio,
              manualSwitchEnabled: sw.manualSwitchEnabled,
              manualMode: sw.manualMode,
              manualActiveLow: sw.manualActiveLow,
              state: sw.state
            })),
            pirEnabled: device.pirEnabled,
            pirGpio: device.pirGpio,
            pirAutoOffDelay: device.pirAutoOffDelay
          };
          ws.send(JSON.stringify(cfgMsg));
        } catch (e) {
          logger.warn('[identify] failed to send config_update', e.message);
        }
        logger.info(`[esp32] identified ${mac}`);
  // Notify frontend clients for immediate UI updates / queued toggle flush
  try { io.emit('device_connected', { deviceId: device.id, mac }); } catch {}
      } catch (e) {
        logger.error('[identify] error', e.message);
      }
      return;
    }
    if (!ws.mac) return; // ignore until identified
    if (type === 'heartbeat') {
      try {
        const Device = require('./models/Device');
        const device = await Device.findOne({ macAddress: ws.mac });
        if (device) {
          device.lastSeen = new Date();
          device.status = 'online';
          await device.save();
          if (process.env.NODE_ENV !== 'production') {
            console.log('[heartbeat] updated lastSeen', { mac: ws.mac, lastSeen: device.lastSeen.toISOString() });
          }
        }
      } catch (e) { /* silent */ }
      return;
    }
  if (type === 'state_update') {
      // basic rate limit: max 5 per 5s per device
      const now = Date.now();
      if (!ws._stateRL) ws._stateRL = [];
      ws._stateRL = ws._stateRL.filter(t => now - t < 5000);
      if (ws._stateRL.length >= 5) {
        return; // drop silently
      }
      ws._stateRL.push(now);
      // Optional HMAC verification
      try {
        if (process.env.REQUIRE_HMAC_IN === '1' && ws.secret) {
          const sig = data.sig;
          const seq = data.seq || 0;
          const ts = data.ts || 0;
          const mac = ws.mac;
          const base = `${mac}|${seq}|${ts}`;
          const exp = crypto.createHmac('sha256', ws.secret).update(base).digest('hex');
          if (!sig || sig !== exp) {
            logger.warn('[hmac] invalid state_update signature', { mac: ws.mac, seq, ts });
            return; // drop
          }
        }
      } catch (e) { /* do not block on hmac errors */ }
      // Drop stale by seq if provided
      const incomingSeq = typeof data.seq === 'number' ? data.seq : undefined;
      if (incomingSeq !== undefined) {
        ws._lastInSeq = ws._lastInSeq || 0;
        if (incomingSeq < ws._lastInSeq) {
          return; // stale
        }
        ws._lastInSeq = incomingSeq;
      }
      try {
        const Device = require('./models/Device');
        const device = await Device.findOne({ macAddress: ws.mac });
        if (!device) return;
        const incoming = Array.isArray(data.switches) ? data.switches : [];
        let changed = false;
        const validGpios = new Set(device.switches.map(sw => sw.gpio || sw.relayGpio));
        incoming.forEach(swIn => {
          const gpio = swIn.gpio ?? swIn.relayGpio;
          if (gpio === undefined) return;
          if (!validGpios.has(gpio)) return; // ignore unknown gpio
          const target = device.switches.find(sw => (sw.gpio || sw.relayGpio) === gpio);
          if (target && target.state !== swIn.state) {
            target.state = !!swIn.state;
            target.lastStateChange = new Date();
            changed = true;
          }
        });
        if (data.pir && device.pirEnabled) {
          device.pirSensorLastTriggered = new Date();
        }
        device.lastSeen = new Date();
  await device.save();
  emitDeviceStateChanged(device, { source: 'esp32:state_update' });
  ws.send(JSON.stringify({ type: 'state_ack', ts: Date.now(), changed }));
      } catch (e) {
        logger.error('[esp32 state_update] error', e.message);
      }
      return;
    }
    if (type === 'switch_result') {
      // HMAC verification first (if enabled)
      try {
        if (process.env.REQUIRE_HMAC_IN === '1' && ws.secret) {
          const sig = data.sig;
          const mac = ws.mac;
          const gpio = data.gpio;
          const success = !!data.success;
          const requested = !!data.requestedState;
          const actual = data.actualState !== undefined ? !!data.actualState : false;
          const seq = data.seq || 0;
          const ts = data.ts || 0;
          const base = `${mac}|${gpio}|${success?1:0}|${requested?1:0}|${actual?1:0}|${seq}|${ts}`;
          const exp = crypto.createHmac('sha256', ws.secret).update(base).digest('hex');
          if (!sig || sig !== exp) {
            logger.warn('[hmac] invalid switch_result signature', { mac: ws.mac, gpio, seq });
            return; // drop
          }
        }
      } catch (e) { /* do not block on hmac errors */ }
      // Drop stale by seq if provided
      const incomingSeq = typeof data.seq === 'number' ? data.seq : undefined;
      if (incomingSeq !== undefined) {
        ws._lastResSeq = ws._lastResSeq || 0;
        if (incomingSeq < ws._lastResSeq) {
          return; // stale
        }
        ws._lastResSeq = incomingSeq;
      }
      try {
        const Device = require('./models/Device');
        const device = await Device.findOne({ macAddress: ws.mac });
        if (!device) return;
        const gpio = data.gpio;
        const success = !!data.success;
        const requested = !!data.requestedState;
        const actual = data.actualState !== undefined ? !!data.actualState : undefined;
        const target = device.switches.find(sw => (sw.gpio || sw.relayGpio) === gpio);
        if (!success) {
          const reason = data.reason || 'unknown_gpio';
          // Treat stale_seq as a harmless, idempotent drop (usually after server restart)
          // Do not surface a failure toast; just emit switch_result for potential UI reconciliation
          if (reason === 'stale_seq') {
            try {
              logger.debug('[switch_result] stale_seq drop', { mac: ws.mac, gpio, requested });
            } catch {}
            // Still forward a lightweight switch_result so UI can optionally refresh
            io.emit('switch_result', { deviceId: device.id, gpio, requestedState: requested, actualState: actual, success: false, reason, ts: Date.now() });
            return;
          }

          logger.warn('[switch_result] failure', { mac: ws.mac, gpio, reason, requested, actual });
          // Reconcile DB with actual hardware state if provided
          if (target && actual !== undefined && target.state !== actual) {
            target.state = actual;
            target.lastStateChange = new Date();
            await device.save();
            emitDeviceStateChanged(device, { source: 'esp32:switch_result:failure', note: reason });
          }
          // Notify UI about blocked toggle AFTER reconciliation so state matches hardware
          io.emit('device_toggle_blocked', { deviceId: device.id, switchGpio: gpio, reason, requestedState: requested, actualState: actual, timestamp: Date.now() });
          // Emit dedicated switch_result event for precise UI reconciliation (failure)
          io.emit('switch_result', { deviceId: device.id, gpio, requestedState: requested, actualState: actual, success: false, reason, ts: Date.now() });
          return;
        }
        // Success path: if backend DB state mismatches actual, reconcile and broadcast
        if (target && actual !== undefined && target.state !== actual) {
          target.state = actual;
          target.lastStateChange = new Date();
          await device.save();
          emitDeviceStateChanged(device, { source: 'esp32:switch_result:success:reconcile' });
        }
        // Always emit switch_result for UI even if no DB change (authoritative confirmation)
        io.emit('switch_result', { deviceId: device.id, gpio, requestedState: requested, actualState: actual !== undefined ? actual : (target ? target.state : undefined), success: true, ts: Date.now() });
      } catch (e) {
        logger.error('[switch_result handling] error', e.message);
      }
      return;
    }
  });
  ws.on('close', () => {
    if (ws.mac) {
      wsDevices.delete(ws.mac);
      logger.info(`[esp32] disconnected ${ws.mac}`);
  try { io.emit('device_disconnected', { mac: ws.mac }); } catch {}
      // Immediately mark device offline instead of waiting for periodic scan
      (async () => {
        try {
          const Device = require('./models/Device');
          const d = await Device.findOne({ macAddress: ws.mac });
          if (d && d.status !== 'offline') {
            d.status = 'offline';
            await d.save();
            emitDeviceStateChanged(d, { source: 'esp32:ws_close' });
          }
        } catch (e) {
          logger.error('[ws close offline update] error', e.message);
        }
      })();
    }
  });
});

// Ping/purge dead WS connections every 30s
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  });
}, 30000);

// Offline detection every 60s (mark devices offline if stale)
setInterval(async () => {
  try {
    const Device = require('./models/Device');
    const cutoff = Date.now() - 60000; // 60s stale
    const stale = await Device.find({ lastSeen: { $lt: new Date(cutoff) }, status: { $ne: 'offline' } });
    for (const d of stale) {
      d.status = 'offline';
  await d.save();
  emitDeviceStateChanged(d, { source: 'offline-scan' });
    }
  } catch (e) {
    logger.error('[offline-scan] error', e.message);
  }
}, 60000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start the server (single attempt)
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = { app, io };
