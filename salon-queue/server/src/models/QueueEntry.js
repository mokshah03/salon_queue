import mongoose from 'mongoose';
import { STATUSES } from '../utils/queueLogic.js';

const { Schema } = mongoose;

const serviceSnapshot = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
    name: String,
    category: String,
    price: Number,
    durationMinutes: Number,
  },
  { _id: false }
);

const historyItem = new Schema(
  { status: String, at: Date, note: { type: String, default: '' } },
  { _id: false }
);

const queueEntrySchema = new Schema(
  {
    token: { type: String, required: true },
    tokenNumber: { type: Number, required: true },
    dateKey: { type: String, required: true },
    customerName: { type: String, required: true },
    phone: { type: String, required: true },
    // Price/duration snapshot: later service edits do not change existing entries.
    services: { type: [serviceSnapshot], required: true },
    totalPrice: { type: Number, required: true },
    totalDurationMinutes: { type: Number, required: true },
    preferredStylist: { type: Schema.Types.ObjectId, ref: 'Stylist', default: null },
    assignedStylist: { type: Schema.Types.ObjectId, ref: 'Stylist', default: null },
    status: { type: String, enum: STATUSES, default: 'WAITING' },
    // "<dateKey>:<phone>" while the entry is active; removed on terminal states.
    // Unique+sparse index => one active entry per phone per day, enforced atomically.
    activeKey: { type: String },
    clientRequestId: { type: String },
    estimatedWaitAtCheckIn: { type: Number, default: null },
    checkedInAt: { type: Date, default: Date.now },
    calledAt: Date,
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    noShowAt: Date,
    history: { type: [historyItem], default: [] },
  },
  { timestamps: true }
);

queueEntrySchema.index({ dateKey: 1, tokenNumber: 1 }, { unique: true });
queueEntrySchema.index({ activeKey: 1 }, { unique: true, sparse: true });
queueEntrySchema.index({ clientRequestId: 1 }, { unique: true, sparse: true });
queueEntrySchema.index({ dateKey: 1, status: 1 });

export default mongoose.model('QueueEntry', queueEntrySchema);
