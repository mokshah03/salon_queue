import mongoose from 'mongoose';
import { CATEGORIES } from '../utils/validators.js';

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    price: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 5 },
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Service', serviceSchema);
