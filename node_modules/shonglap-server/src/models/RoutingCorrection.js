import mongoose from 'mongoose';

const routingCorrectionSchema = new mongoose.Schema({
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
  originalDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  correctedDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  at: { type: Date, default: Date.now }
}, {
  timestamps: true
});

export const RoutingCorrection = mongoose.model('RoutingCorrection', routingCorrectionSchema);
