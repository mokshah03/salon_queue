import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { seedIfEmpty } from './config/seed.js';
import './models/Service.js';
import './models/Stylist.js';
import './models/QueueEntry.js';
import './models/DailyCounter.js';
import './models/Settings.js';

async function start() {
  try {
    await connectDB(env.mongoUri);
    // Make sure unique indexes (tokens, duplicate prevention) exist before accepting traffic.
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    await seedIfEmpty();
  } catch (err) {
    console.error('Startup failed:', err.message);
    console.error(`MongoDB URI: ${env.mongoUri}`);
    console.error('Make sure the MongoDB service is running, then try again.');
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async () => {
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
