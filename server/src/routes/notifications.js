import express from 'express';
import { Complaint } from '../models/Complaint.js';
import { requireAuth, requireRole, requireDepartment } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/User.js';

const router = express.Router();

/**
 * Build notifications for a staff user from complaint data.
 * - Admin: triage queue + critical complaints + escalations
 * - Department: new/overdue complaints for their department + escalations
 */
function buildNotifications(complaints, role) {
  const notes = [];
  const now = Date.now();

  for (const c of complaints) {
    // Escalation entries in statusLog
    const escalations = (c.statusLog || []).filter(
      (e) => e.note?.includes('SLA overdue') || e.status === 'escalated'
    );
    for (const e of escalations) {
      notes.push({
        id: `${c._id}-esc-${e.at?.getTime?.() || 0}`,
        type: 'escalation',
        trackingId: c.trackingId,
        title: role === 'admin' ? 'Complaint escalated' : 'SLA breach on your complaint',
        message: `${c.trackingId} (${c.category}) exceeded its SLA deadline.`,
        at: e.at,
        read: false,
      });
    }

    // Triage queue (admin only)
    if (role === 'admin' && c.status === 'triage') {
      notes.push({
        id: `${c._id}-triage`,
        type: 'triage',
        trackingId: c.trackingId,
        title: 'Needs triage',
        message: `${c.trackingId} (${c.category}) is awaiting manual assignment.`,
        at: c.createdAt,
        read: false,
      });
    }

    // Critical complaints
    if (c.urgency === 'critical' && c.status !== 'resolved') {
      notes.push({
        id: `${c._id}-critical`,
        type: 'critical',
        trackingId: c.trackingId,
        title: 'Critical complaint',
        message: `${c.trackingId}: ${c.category} in ${c.area} needs immediate attention.`,
        at: c.createdAt,
        read: false,
      });
    }

    // New complaints (last 48h) assigned to department
    if (role === 'department' && c.status === 'assigned' && (now - new Date(c.createdAt).getTime()) < 48 * 3600 * 1000) {
      notes.push({
        id: `${c._id}-new`,
        type: 'new',
        trackingId: c.trackingId,
        title: 'New complaint assigned',
        message: `${c.trackingId} (${c.category}) in ${c.area} was assigned to you.`,
        at: c.createdAt,
        read: false,
      });
    }
  }

  return notes.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20);
}

// GET /api/notifications
router.get('/', requireAuth, requireRole('department', 'admin'), requireDepartment, async (req, res, next) => {
  try {
    const user = req.dbUser;
    const role = user.role;
    let filter = {};

    if (role === 'department' && user.department) {
      filter['routing.department'] = user.department._id;
    }

    const complaints = await Complaint.find(filter)
      .select('trackingId category area urgency status createdAt statusLog')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const notifications = buildNotifications(complaints, role);
    const read = new Set(user.readNotifications || []);
    const withRead = notifications.map((n) => ({ ...n, read: read.has(String(n.id)) }));
    const unread = withRead.filter((n) => !n.read).length;
    res.status(200).json({ notifications: withRead, unread });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to build notifications');
    next(err);
  }
});

// POST /api/notifications/read - mark specific (or all) notifications as read
router.post('/read', requireAuth, requireRole('department', 'admin'), requireDepartment, async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    const user = req.dbUser;
    const filter = {};
    if (user.role === 'department' && user.department) filter['routing.department'] = user.department._id;

    const complaints = await Complaint.find(filter)
      .select('trackingId category area urgency status createdAt statusLog')
      .sort({ createdAt: -1 }).limit(100).lean();
    const allIds = buildNotifications(complaints, user.role).map((n) => String(n.id));

    const toMark = Array.isArray(ids) && ids.length > 0
      ? ids.filter((id) => allIds.includes(String(id)))
      : allIds; // no ids = mark all

    const updated = await User.findByIdAndUpdate(
      user._id,
      { $addToSet: { readNotifications: { $each: toMark.map(String) } } },
      { new: true }
    ).lean();

    res.status(200).json({ ok: true, unread: 0, readCount: (updated.readNotifications || []).length });
  } catch (err) {
    next(err);
  }
});

export default router;
