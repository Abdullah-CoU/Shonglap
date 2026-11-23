import mongoose from 'mongoose';
import { Complaint } from '../models/Complaint.js';
import { logger } from '../utils/logger.js';

const DUPLICATE_RADIUS_METERS = 100;
const DUPLICATE_WINDOW_DAYS = 7;

/**
 * Find potential duplicate complaints near a location.
 *
 * @param {Object} params
 * @param {number} params.lat - Latitude.
 * @param {number} params.lng - Longitude.
 * @param {string} params.category - Complaint category.
 * @param {string} [params.area] - Area name.
 * @returns {Promise<Array>} - Array of potential duplicate complaints.
 */
export async function findDuplicates({ lat, lng, category, area }) {
  // Ensure geospatial index exists
  await Complaint.ensureIndexes();

  const sevenDaysAgo = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const query = {
    category,
    createdAt: { $gte: sevenDaysAgo },
    status: { $nin: ['rejected'] },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: DUPLICATE_RADIUS_METERS,
      },
    },
  };

  if (area) {
    query.area = new RegExp(area, 'i');
  }

  const duplicates = await Complaint.find(query)
    .select('trackingId category area description urgency status supporters createdAt location')
    .limit(10)
    .lean();

  return duplicates.map((d) => ({
    ...d,
    distance: null, // $near doesn't return distance by default; use $geoNear for that
  }));
}

/**
 * Increment supporters count on an existing complaint.
 *
 * @param {string} complaintId - Complaint _id or trackingId.
 * @returns {Promise<Object>} - Updated complaint.
 */
export async function addSupporter(complaintId) {
  let query;
  if (mongoose.Types.ObjectId.isValid(complaintId)) {
    query = { $or: [{ _id: complaintId }, { trackingId: complaintId }] };
  } else {
    query = { trackingId: complaintId };
  }

  const complaint = await Complaint.findOneAndUpdate(
    query,
    { $inc: { supporters: 1 } },
    { new: true }
  ).select('_id trackingId supporters').lean();

  if (!complaint) {
    throw new Error('Complaint not found');
  }

  logger.info({ trackingId: complaint.trackingId, supporters: complaint.supporters }, 'Supporter added');
  return complaint;
}
