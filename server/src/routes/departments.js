import express from 'express';
import { z } from 'zod';
import { Complaint } from '../models/Complaint.js';
import { Department } from '../models/Department.js';
import { requireAuth, requireRole, requireDepartment, departmentScope } from '../middleware/auth.js';
import { validate, validateParams, validateQuery } from '../middleware/validate.js';
import { sendStatusUpdate } from '../services/notify.js';
import { logger } from '../utils/logger.js';
import { partForDepartment } from '../services/departmentParts.js';

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

/** Shape a complaint for a department office: only its own part is visible. */
function scopedForOffice(complaint, departmentId) {
  const part = partForDepartment(complaint, departmentId);
  const allCount = (complaint.departmentParts || complaint.routing || []).length;
  return {
    ...complaint,
    myPart: part,
    displayDescription: part.description || complaint.description,
    shared: allCount > 1,
    otherOfficesCount: Math.max(0, allCount - 1),
    routing: (complaint.routing || []).filter(
      (r) => r.department?._id?.toString() === String(departmentId) || r.department?.toString() === String(departmentId)
    ),
  };
}

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
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes departmentParts locationSource locationConfidence matchedLandmark routingVerification')
      .sort({ urgency: -1, createdAt: -1 })
      .lean();

    // Sort by urgency priority
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    complaints.sort((a, b) => (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3));

    const deptId = req.dbUser.role === 'department' ? req.dbUser.department?._id : null;
    const shaped = deptId ? complaints.map((c) => scopedForOffice(c, deptId)) : complaints;
    res.status(200).json({ complaints: shaped, total: shaped.length });
  } catch (err) {
    next(err);
  }
});

// Get complaint detail
router.get('/complaints/:id', requireAuth, requireRole('department', 'admin'), requireDepartment, validateParams(objectIdParam), async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.validatedParams.id)
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes departmentParts locationSource locationConfidence matchedLandmark routingVerification')
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

    if (req.dbUser.role === 'department' && req.dbUser.department) {
      const deptId = req.dbUser.department._id;
      const part = partForDepartment(complaint, deptId);
      const scoped = scopedForOffice(complaint, deptId);
      res.status(200).json({
        complaint: scoped,
        view: {
          department: { id: deptId, nameEn: req.dbUser.department.nameEn, nameBn: req.dbUser.department.nameBn },
          aspect: part.aspect,
          description: part.description,
          role: part.role,
          status: part.status,
          shared: scoped.shared,
          otherOfficesCount: scoped.otherOfficesCount,
        },
      });
      return;
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
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes departmentParts locationSource locationConfidence matchedLandmark routingVerification');
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

    const actor = req.dbUser.name || req.dbUser.email;
    const officeId = req.dbUser.role === 'department' ? req.dbUser.department?._id : null;
    const ownPart = officeId
      ? (complaint.departmentParts || []).find((part) => part.department?.toString() === officeId.toString())
      : null;

    if (ownPart) {
      // Cross-department complaint: this office only updates its own part.
      ownPart.status = status;
      ownPart.statusLog.push({
        status,
        note: note || `Status updated to ${status}`,
        actor,
        at: new Date(),
      });
      const all = complaint.departmentParts.map((part) => part.status);
      complaint.status = all.every((s) => s === 'resolved')
        ? 'resolved'
        : all.includes('in_progress')
          ? 'in_progress'
          : all.includes('assigned')
            ? 'assigned'
            : all.includes('triage') ? 'triage' : 'received';
      complaint.statusLog.push({
        status: complaint.status,
        note: `Office part updated to ${status}`,
        actor,
        at: new Date(),
      });
    } else {
      // Legacy / single-office complaint.
      complaint.status = status;
      complaint.statusLog.push({
        status,
        note: note || `Status updated to ${status}`,
        actor,
        at: new Date(),
      });
    }

    if (resolutionPhoto) {
      complaint.attachments.push({
        type: 'photo',
        path: resolutionPhoto,
        meta: { resolution: true },
      });
    }

    await complaint.save();

    const leanComplaint = complaint.toObject();
    sendStatusUpdate(leanComplaint, status, note).catch((e) =>
      logger.error({ err: e.message }, 'Status update notification failed')
    );

    const shaped = officeId ? scopedForOffice(leanComplaint, officeId) : leanComplaint;
    res.status(200).json({ complaint: shaped, view: ownPart ? { aspect: ownPart.aspect, description: ownPart.description, status: ownPart.status, role: ownPart.role } : null });
  } catch (err) {
    next(err);
  }
});

export default router;
