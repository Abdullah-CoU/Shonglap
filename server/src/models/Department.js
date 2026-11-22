import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  nameEn: { type: String, required: true, unique: true },
  nameBn: { type: String, required: true },
  email: { type: String, required: true },
  webhookUrl: { type: String, default: '' },
  responsibilities: { type: String, required: true },
  keywords: [{ type: String }],
  jurisdictionType: { type: String, required: true, index: true },
  slaHours: { type: Map, of: Number, default: {} }
}, {
  timestamps: true
});

export const Department = mongoose.model('Department', departmentSchema);
