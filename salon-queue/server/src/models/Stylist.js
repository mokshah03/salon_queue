import mongoose from 'mongoose';
import { STYLIST_STATUSES } from '../utils/validators.js';

const stylistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    specialties: { type: [String], default: [] },
    // Empty list = can perform every service.
    serviceIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Service', default: [] },
    status: { type: String, enum: STYLIST_STATUSES, default: 'AVAILABLE' },
  },
  { timestamps: true }
);

export default mongoose.model('Stylist', stylistSchema);
