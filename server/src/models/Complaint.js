import mongoose from 'mongoose';

/**
 * @typedef {Object} Attachment
 * @property {'photo'|'audio'} type
 * @property {string} path
 * @property {Object} [meta]
 */

/**
 * @typedef {Object} RoutingEntry
 * @property {mongoose.Types.ObjectId} department
 * @property {boolean} isPrimary
 * @property {'auto'|'manual'} assignedBy
 * @property {string} reason
 */

/**
 * @typedef {Object} StatusLogEntry
 * @property {'received'|'assigned'|'in_progress'|'resolved'|'rejected'|'triage'} status
 * @property {string} [note]
 * @property {string} actor
 * @property {Date} at
 */

const complaintSchema = new mongoose.Schema({
  trackingId: { type: String, required: true, unique: true, index: true },
  rawText: { type: String, default: '' },
  transcript: { type: String, default: '' },
  category: { type: String, required: true, index: true },
  description: { type: String, required: true },
  descriptionBn: { type: String, default: '' },
  area: { type: String, required: true, index: true },
  ward: { type: Number, index: true },
  landmark: { type: String, default: '' },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [90.4125, 23.8103] } // [longitude, latitude]
  },
  urgency: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium', index: true },
  status: { 
    type: String, 
    enum: ['received', 'assigned', 'in_progress', 'resolved', 'rejected', 'triage'], 
    default: 'received', 
    index: true 
  },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  language: { type: String, enum: ['bn', 'en', 'banglish'], default: 'bn' },
  supporters: { type: Number, default: 0 },
  attachments: [{
    type: { type: String, enum: ['photo', 'audio'], required: true },
    path: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  }],
  routing: [{
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    isPrimary: { type: Boolean, default: true },
    assignedBy: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    reason: { type: String, default: '' }
  }],
  statusLog: [{
    status: { type: String, required: true },
    note: { type: String, default: '' },
    actor: { type: String, default: 'system' },
    at: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

complaintSchema.index({ location: '2dsphere' });

export const Complaint = mongoose.model('Complaint', complaintSchema);
