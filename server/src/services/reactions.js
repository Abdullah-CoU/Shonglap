import { Complaint } from '../models/Complaint.js';

/**
 * Apply an up/down reaction to a complaint and return updated counts.
 * Uses an atomic update with a non-negative guard for removals.
 *
 * @param {string} trackingId - Complaint tracking ID.
 * @param {'up'|'down'} type - Reaction type.
 * @param {'add'|'remove'} action - Whether to add or remove the reaction.
 * @returns {Promise<{upvotes: number, downvotes: number}>}
 */
export async function reactToComplaint(trackingId, type, action) {
  const inc = {};
  const field = type === 'up' ? 'upvotes' : 'downvotes';
  inc[field] = action === 'add' ? 1 : -1;

  // For removals, only decrement when the counter is still positive.
  const guard = action === 'remove' ? { [field]: { $gt: 0 } } : {};
  const filter = { trackingId, ...guard };

  const complaint = await Complaint.findOneAndUpdate(
    filter,
    { $inc: inc },
    { new: true }
  ).select('_id trackingId upvotes downvotes supporters').lean();

  if (!complaint) {
    // Distinguish "not found" from "nothing to remove"
    const exists = await Complaint.exists({ trackingId });
    const error = new Error(exists ? 'No reaction to remove' : 'Complaint not found');
    error.status = exists ? 409 : 404;
    throw error;
  }

  return {
    upvotes: Math.max(0, complaint.upvotes || 0),
    downvotes: Math.max(0, complaint.downvotes || 0),
  };
}
