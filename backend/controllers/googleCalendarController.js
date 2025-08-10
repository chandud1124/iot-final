// Google Calendar Integration Controller with per-user token persistence
const { google } = require('googleapis');
const { OAuth2 } = google.auth;
const User = require('../models/User');

// You need to set these up in your Google Cloud Console
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// Ensure redirect URI matches backend port & route actually exposed
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-calendar/callback';

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// Step 1: Get Auth URL
exports.getAuthUrl = (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Google OAuth not configured',
      missing: {
        GOOGLE_CLIENT_ID: !CLIENT_ID,
        GOOGLE_CLIENT_SECRET: !CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: !process.env.GOOGLE_REDIRECT_URI
      },
      message: 'Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI to backend/.env then restart server.'
    });
  }
  const oAuth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    include_granted_scopes: true,
    state: req.query.state || 'calendar_connect'
  });
  res.json({ url });
};

// Step 2: Handle OAuth callback and get tokens
exports.handleCallback = async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: 'Missing code parameter' });
  const oAuth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    // Persist to user
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    user.googleCalendarTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || user.googleCalendarTokens?.refresh_token, // keep existing refresh if not re-issued
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
      obtainedAt: new Date()
    };
    await user.save();
    res.json({ tokens: user.googleCalendarTokens, receivedState: req.query.state, stored: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to get tokens', details: err.message });
  }
};

// Step 3: Fetch events using tokens
exports.getEvents = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || !user.googleCalendarTokens || !user.googleCalendarTokens.access_token) {
    return res.status(400).json({ error: 'Not connected to Google Calendar' });
  }
  const tokens = user.googleCalendarTokens;
  const oAuth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  oAuth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  try {
    const now = new Date();
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    });
    res.json({ events: events.data.items });
  } catch (err) {
    res.status(400).json({ error: 'Failed to fetch events', details: err.message });
  }
};

// Status route
exports.getStatus = async (req, res) => {
  const user = await User.findById(req.user.id).select('googleCalendarTokens');
  const t = user?.googleCalendarTokens;
  res.json({
    connected: !!t?.access_token,
    obtainedAt: t?.obtainedAt,
    expiresIn: t?.expiry_date ? Math.max(0, Math.floor((t.expiry_date - Date.now()) / 1000)) : null,
    hasRefreshToken: !!t?.refresh_token,
    redirectURI: REDIRECT_URI
  });
};

// Disconnect (clear cache)
exports.disconnect = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user) {
    user.googleCalendarTokens = undefined;
    await user.save();
  }
  res.json({ disconnected: true });
};
