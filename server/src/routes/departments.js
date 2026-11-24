import express from 'express';
import { z } from 'zod';
import { Complaint } from '../models/Complaint.js';
import { Department } from '../models/Department.js';
import { requireAuth, requireRole, requireDepartment, departmentScope } from '../middleware/auth.js';
import { validate, validateParams, validateQuery } from '../middleware/validate.js';
import { sendStatusUpdate } from '../services/notify.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const statusUpdateSchema = z.object({
  status: z.enum(['received', 'assigned', 'in_progress', 'resolved', 'rejected', 'triage']),
  note: z.string().max(2000).optional().default(''),
  resolutionPhoto: z.string().max(500).optional(),
});

const objectIdParam = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid complaint ID'),
});

const complaintsQuerySchema = z.object({
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['received', 'assigned', 'in_progress', 'resolved', 'rejected', 'triage']).optional(),
  area: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// List all departments (for admin picker)
router.get('/', async (req, res, next) => {
  try {
    const departments = await Department.find({}).select('nameEn nameBn jurisdictionType _id').lean();
    res.status(200).json({ departments });
  } catch (err) {
    next(err);
  }
});

// List complaints for the department
router.get('/complaints', requireAuth, requireRole('department', 'admin'), requireDepartment, validateQuery(complaintsQuerySchema), async (req, res, next) => {
  try {
    const { urgency, status, area, from, to } = req.validatedQuery;

    const filter = {};

    // Department users only see their department's complaints
    if (req.dbUser.role === 'department' && req.dbUser.department) {
      filter['routing.department'] = req.dbUser.department._id;
    }

    if (urgency) filter.urgency = urgency;
    if (status) filter.status = status;
    if (area) filter.area = new RegExp(area.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) filter.createdAt.$lte = to;
    }

    const complaints = await Complaint.find(filter)
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes')
      .sort({ urgency: -1, createdAt: -1 })
      .lean();

    // Sort by urgency priority
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    complaints.sort((a, b) => (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3));

    res.status(200).json({ complaints, total: complaints.length });
  } catch (err) {
    next(err);
  }
});

// Get complaint detail
router.get('/complaints/:id', requireAuth, requireRole('department', 'admin'), requireDepartment, validateParams(objectIdParam), async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.validatedParams.id)
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes')
      .populate('routing.department', '_id nameEn nameBn jurisdictionType')
      .lean();

    if (!complaint) {
      return res.status(404).json({ error: { message: 'Complaint not found', status: 404 } });
    }

    // Department users can only view their department's complaints
    if (req.dbUser.role === 'department' && req.dbUser.department) {
      const deptId = req.dbUser.department._id.toString();
      const isAssigned = complaint.routing.some((r) => r.department?._id?.toString() === deptId || r.department?.toString() === deptId);
      if (!isAssigned) {
        return res.status(403).json({ error: { message: 'Not authorized', status: 403 } });
      }
    }

    res.status(200).json({ complaint });
  } catch (err) {
    next(err);
  }
});

// Update complaint status
router.patch('/complaints/:id/status', requireAuth, requireRole('department', 'admin'), requireDepartment, validateParams(objectIdParam), validate(statusUpdateSchema), async (req, res, next) => {
  try {
    const { status, note, resolutionPhoto } = req.validated;

    const complaint = await Complaint.findById(req.validatedParams.id)
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes');
    if (!complaint) {
      return res.status(404).json({ error: { message: 'Complaint not found', status: 404 } });
    }

    // Department users can only update their department's complaints
    if (req.dbUser.role === 'department' && req.dbUser.department) {
      const deptId = req.dbUser.department._id.toString();
      const isAssigned = complaint.routing.some((r) => r.department?.toString() === deptId);
      if (!isAssigned) {
        return res.status(403).json({ error: { message: 'Not authorized', status: 403 } });
      }
    }

    complaint.status = status;
    complaint.statusLog.push({
      status,
      note: note || `Status updated to ${status}`,
      actor: req.dbUser.name || req.dbUser.email,
      at: new Date(),
    });

    if (resolutionPhoto) {
      complaint.attachments.push({
        type: 'photo',
        path: resolutionPhoto,
        meta: { resolution: true },
      });
    }

    await complaint.save();

    // Send status update to citizen
    const leanComplaint = complaint.toObject();
    sendStatusUpdate(leanComplaint, status, note).catch((e) =>
      logger.error({ err: e.message }, 'Status update notification failed')
    );

    res.status(200).json({ complaint: leanComplaint });
  } catch (err) {
    next(err);
  }
});

export default router;
