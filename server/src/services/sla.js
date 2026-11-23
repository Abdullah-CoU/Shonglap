import { Complaint } from '../models/Complaint.js';
import { Department } from '../models/Department.js';
import { sendDepartmentEmail } from './notify.js';
import { logger } from '../utils/logger.js';

const URGENCY_TO_CATEGORY = {
  critical: 'emergency',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/**
 * Check for overdue complaints and escalate.
 * Uses Department.slaHours to determine if a complaint is overdue.
 *
 * @returns {Promise<{checked: number, escalated: number}>}
 */
export async function checkSLA() {
  const now = new Date();
  let checked = 0;
  let escalated = 0;

  const activeComplaints = await Complaint.find({
    status: { $in: ['received', 'assigned', 'in_progress'] },
  })
    .select('_id trackingId category area urgency status createdAt slaDeadline routing statusLog')
    .populate('routing.department', '_id nameEn nameBn slaHours jurisdictionType')
    .lean();

  for (const complaint of activeComplaints) {
    checked++;

    const primaryRouting = complaint.routing?.find((r) => r.isPrimary);
    if (!primaryRouting?.department) continue;

    const department = primaryRouting.department;
    const slaHours = department.slaHours || {};
    const category = complaint.category;
    const sla = slaHours[category] || slaHours[complaint.urgency] || null;

    if (!sla) continue;

    const deadline = new Date(complaint.createdAt.getTime() + sla * 60 * 60 * 1000);
    if (now <= deadline) continue;

    // Overdue - check if already escalated
    const alreadyEscalated = complaint.statusLog?.some(
      (entry) => entry.status === 'escalated' || entry.note?.includes('SLA overdue')
    );
    if (alreadyEscalated) continue;

    // Escalate
    try {
      await Complaint.findByIdAndUpdate(complaint._id, {
        $push: {
          statusLog: {
            status: complaint.status,
            note: `SLA overdue: ${sla}h deadline exceeded. Escalated.`,
            actor: 'system-sla',
            at: now,
          },
        },
      }).select('_id');

      // Email department head
      await sendDepartmentEmail(
        { ...complaint, urgency: 'critical' },
        department
      );

      escalated++;
      logger.info(
        { trackingId: complaint.trackingId, department: department.nameEn, slaHours: sla },
        'Complaint escalated due to SLA breach'
      );
    } catch (err) {
      logger.error({ err: err.message, trackingId: complaint.trackingId }, 'SLA escalation failed');
    }
  }

  return { checked, escalated };
}

/**
 * Start the SLA cron job.
 * Runs every 15 minutes.
 */
export async function startSLACron() {
  // Use node-cron if available
  try {
    const cron = await import('node-cron');
    cron.default.schedule('*/15 * * * *', async () => {
      logger.info('Running SLA check');
      try {
        const result = await checkSLA();
        logger.info(result, 'SLA check complete');
      } catch (err) {
        logger.error({ err: err.message }, 'SLA check failed');
      }
    });
    logger.info('SLA cron job started (every 15 minutes)');
  } catch (err) {
    logger.warn({ err: err.message }, 'node-cron not available, SLA cron not started');
  }
}
