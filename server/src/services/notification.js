import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Send a notification (email) about a new complaint.
 * In MOCK/test mode, just logs.
 *
 * @param {Object} params
 * @param {string} params.trackingId
 * @param {string} params.departmentEmail
 * @param {string} params.subject
 * @param {string} params.body
 * @returns {Promise<void>}
 */
export async function notifyDepartment({ trackingId, departmentEmail, subject, body }) {
  if (env.NODE_ENV === 'test' || env.MOCK_LLM) {
    logger.info({ trackingId, departmentEmail, subject }, 'MOCK notification sent');
    return;
  }

  // In production, use nodemailer
  // For now, log
  logger.info({ trackingId, departmentEmail, subject }, 'Notification queued');
}

/**
 * Send confirmation to citizen.
 *
 * @param {Object} params
 * @param {string} params.trackingId
 * @param {string} [params.email]
 * @param {string} [params.phone]
 * @returns {Promise<void>}
 */
export async function notifyCitizen({ trackingId, email, phone }) {
  if (env.NODE_ENV === 'test' || env.MOCK_LLM) {
    logger.info({ trackingId, email, phone }, 'MOCK citizen notification sent');
    return;
  }
  logger.info({ trackingId, email, phone }, 'Citizen notification queued');
}
