const nodemailer = require('nodemailer');

// Detect whether email is properly configured
const emailConfigured = !!(process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD && process.env.EMAIL_FROM);

let transporter = null;
if (emailConfigured) {
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });
  // Optional verification (non-blocking)
  transporter.verify().then(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] transporter verified');
    }
  }).catch(err => {
    console.error('[email] transporter verification failed:', err.message);
  });
} else {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[email] Email credentials not fully configured. Falling back to console log mode.');
  }
}

const sendPasswordResetEmail = async (email, resetUrl) => {
  if (!emailConfigured) {
    console.log('[email:fallback] Password reset link for', email, '=>', resetUrl);
    return true; // pretend success in dev fallback
  }
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>You have requested to reset your password</h1>
        <p>Please click the following link to reset your password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour</p>
        <p>If you did not request this, please ignore this email</p>
      `
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

const sendTempPasswordEmail = async (email, tempPassword) => {
  if (!emailConfigured) {
    console.log('[email:fallback] Temp password for', email, '=>', tempPassword);
    return true;
  }
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your Temporary Account Password',
      html: `
        <p>An account has been created for you.</p>
        <p>Temporary password: <strong>${tempPassword}</strong></p>
        <p>Please log in and change this password immediately.</p>
      `
    });
    return true;
  } catch (error) {
    console.error('Temp password email error:', error);
    return false;
  }
};

const sendPasswordChangedEmail = async (email) => {
  if (!emailConfigured) {
    console.log('[email:fallback] Password changed notification for', email);
    return true;
  }
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your Password Was Changed',
      html: `<p>This is a confirmation that your password was just changed. If you did not do this, contact support immediately.</p>`
    });
    return true;
  } catch (error) {
    console.error('Password changed email error:', error);
    return false;
  }
};

module.exports = { sendPasswordResetEmail, sendTempPasswordEmail, sendPasswordChangedEmail };
