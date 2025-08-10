const Settings = require('../models/Settings');

exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({}); // Create with defaults
    }
    res.json(settings);
  } catch (error) {
      res.status(500).json({ error: 'Error fetching settings' });
    }
  }

exports.updateSettings = async (req, res) => {
  try {
    const { notifications, security } = req.body;
    let settings = await Settings.findOne();
    
    if (!settings) {
      settings = new Settings({});
    }

    // Update only provided fields
    if (notifications) settings.notifications = { ...settings.notifications, ...notifications };
    if (security) settings.security = { ...settings.security, ...security };

    await settings.save();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Error updating settings' });
  }
};

// Settings controller only handles general settings now
