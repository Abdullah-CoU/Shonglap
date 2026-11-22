import mongoose from 'mongoose';

const draftSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // TTL 1 hour
}, {
  timestamps: true
});

export const Draft = mongoose.model('Draft', draftSchema);
