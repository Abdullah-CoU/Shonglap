import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  if (env.NODE_ENV === 'test' || env.MOCK_LLM) {
    // Mock transporter for tests
    transporter = {
      sendMail: async (opts) => {
        logger.info({ to: opts.to, subject: opts.subject }, 'MOCK email sent');
        return { messageId: 'mock-' + Date.now() };
      },
    };
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
};

/**
 * Send department notification email about a new complaint.
 *
 * @param {Object} complaint - Complaint document (lean).
 * @param {Object} department - Department document (lean).
 * @returns {Promise<void>}
 */
export async function sendDepartmentEmail(complaint, department) {
  const trackingId = complaint.trackingId;
  const mapLink = complaint.location?.coordinates
    ? `https://www.google.com/maps?q=${complaint.location.coordinates[1]},${complaint.location.coordinates[0]}`
    : '';
  const photoLinks = (complaint.attachments || [])
    .filter((a) => a.type === 'photo')
    .map((a) => `<a href="${a.path}">${a.path}</a>`)
    .join('<br/>');
  const dashboardLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`;

  const html = `
    <h2>New Complaint: ${trackingId}</h2>
    <p><strong>Category:</strong> ${complaint.category}</p>
    <p><strong>Urgency:</strong> ${complaint.urgency}</p>
    <p><strong>Area:</strong> ${complaint.area}</p>
    <p><strong>Description:</strong> ${complaint.description}</p>
    ${complaint.descriptionBn ? `<p><strong>Bangla:</strong> ${complaint.descriptionBn}</p>` : ''}
    ${complaint.landmark ? `<p><strong>Landmark:</strong> ${complaint.landmark}</p>` : ''}
    ${mapLink ? `<p><strong>Location:</strong> <a href="${mapLink}">View on Map</a></p>` : ''}
    ${photoLinks ? `<p><strong>Photos:</strong><br/>${photoLinks}</p>` : ''}
    <p><strong>Confidence:</strong> ${complaint.confidence}</p>
    <p><a href="${dashboardLink}">Open Dashboard</a></p>
  `;

  try {
    const t = getTransporter();
    await t.sendMail({
      from: process.env.SMTP_FROM || 'noreply@shonglap.gov.bd',
      to: department.email,
      subject: `[Shonglap] New Complaint ${trackingId} - ${complaint.urgency.toUpperCase()}`,
      html,
    });
    logger.info({ trackingId, department: department.nameEn }, 'Department email sent');
  } catch (err) {
    logger.error({ err: err.message, trackingId }, 'Failed to send department email');
  }
}

/**
 * Send status update to citizen if they provided an email.
 *
 * @param {Object} complaint - Complaint document (lean).
 * @param {string} newStatus - New status.
 * @param {string} [note] - Optional note.
 * @returns {Promise<void>}
 */
export async function sendStatusUpdate(complaint, newStatus, note = '') {
  const email = complaint.contactEmail;
  if (!email) return;

  const trackingId = complaint.trackingId;
  const html = `
    <h2>Complaint Status Update</h2>
    <p><strong>Tracking ID:</strong> ${trackingId}</p>
    <p><strong>New Status:</strong> ${newStatus}</p>
    ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
    <p>Track your complaint at: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/track/${trackingId}</p>
  `;

  try {
    const t = getTransporter();
    await t.sendMail({
      from: process.env.SMTP_FROM || 'noreply@shonglap.gov.bd',
      to: email,
      subject: `[Shonglap] Status Update: ${trackingId} - ${newStatus}`,
      html,
    });
    logger.info({ trackingId, email, newStatus }, 'Citizen status update sent');
  } catch (err) {
    logger.error({ err: err.message, trackingId }, 'Failed to send citizen update');
  }
}

/**
 * Dispatch webhook to department if webhookUrl is set.
 *
 * @param {Object} department - Department document (lean).
 * @param {Object} payload - Payload to POST.
 * @returns {Promise<void>}
 */
export async function dispatchWebhook(department, payload) {
  if (!department.webhookUrl) return;

  try {
    const res = await fetch(department.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, url: department.webhookUrl }, 'Webhook returned non-OK');
    } else {
      logger.info({ url: department.webhookUrl }, 'Webhook dispatched');
    }
  } catch (err) {
    logger.error({ err: err.message, url: department.webhookUrl }, 'Webhook dispatch failed');
  }
}

/**
 * Fire all notifications for a new complaint asynchronously.
 *
 * @param {Object} complaint - Complaint document (lean).
 * @param {Object} department - Department document (lean).
 */
export function fireNotifications(complaint, department) {
  // Fire and forget - don't await
  sendDepartmentEmail(complaint, department).catch((e) =>
    logger.error({ err: e.message }, 'Department email failed')
  );
  dispatchWebhook(department, {
    event: 'complaint.created',
    complaint,
  }).catch((e) => logger.error({ err: e.message }, 'Webhook failed'));

  if (complaint.contactEmail) {
    sendStatusUpdate(complaint, complaint.status).catch((e) =>
      logger.error({ err: e.message }, 'Citizen notification failed')
    );
  }
}
