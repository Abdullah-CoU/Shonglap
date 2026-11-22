import mongoose from 'mongoose';

const jurisdictionSchema = new mongoose.Schema({
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  areaName: { type: String, required: true, index: true },
  wards: [{ type: Number }],
  verified: { type: Boolean, default: true }
}, {
  timestamps: true
});

export const Jurisdiction = mongoose.model('Jurisdiction', jurisdictionSchema);
