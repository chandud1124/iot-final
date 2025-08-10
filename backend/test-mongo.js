// Quick MongoDB connectivity diagnostic
const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('MONGODB_URI not set in environment');
      process.exit(1);
    }
    console.log('Attempting connect to:', uri.replace(/:[^@]+@/, ':****@'));
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('Connected OK. Database name:', mongoose.connection.name);
    const adminCount = await mongoose.connection.db.collection('users').countDocuments({ role: 'admin' }).catch(()=>null);
    if (adminCount !== null) console.log('Admin users count:', adminCount);
  } catch (e) {
    console.error('Connection failed:', e.name, e.message);
    if (e.reason) console.error('Reason:', e.reason);
  } finally {
    await mongoose.disconnect().catch(()=>{});
    process.exit(0);
  }
})();
