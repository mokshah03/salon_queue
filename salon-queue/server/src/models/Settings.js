import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  _id: { type: String },
  tokenPrefix: { type: String, default: 'S' },
  openTime: { type: String, default: '09:00' },
  closeTime: { type: String, default: '21:00' },
  warnAfterMinutes: { type: Number, default: 20 },
  // When false the open/closed indicator is informational only (handy for demos).
  enforceHours: { type: Boolean, default: false },
});

export default mongoose.model('Settings', settingsSchema);
