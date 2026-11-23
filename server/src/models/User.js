import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['department', 'admin'], default: 'department' },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  readNotifications: { type: [String], default: [] }
}, {
  timestamps: true
});

export const User = mongoose.model('User', userSchema);
