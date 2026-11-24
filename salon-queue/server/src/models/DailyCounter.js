import mongoose from 'mongoose';

// One document per salon day (_id = "YYYY-MM-DD"). Incremented atomically with $inc.
const dailyCounterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

export default mongoose.model('DailyCounter', dailyCounterSchema);
