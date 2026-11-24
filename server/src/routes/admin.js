import express from 'express';
import { z } from 'zod';
import { Complaint } from '../models/Complaint.js';
import { Department } from '../models/Department.js';
import { RoutingCorrection } from '../models/RoutingCorrection.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, validateParams, validateQuery } from '../middleware/validate.js';
import { adminLimiter } from '../middleware/rateLimits.js';
import { logger } from '../utils/logger.js';

const router = express.Router();
router.use(adminLimiter);

const assignSchema = z.object({
  departmentId: z.string().min(1),
  note: z.string().optional().default(''),
});

const rerouteSchema = z.object({
  newDepartmentId: z.string().min(1),
  note: z.string().optional().default(''),
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

// Triage queue: complaints with status 'triage'
router.get('/triage', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const complaints = await Complaint.find({ status: 'triage' })
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes departmentParts locationSource locationConfidence matchedLandmark routingVerification')
      .populate('routing.department', '_id nameEn nameBn jurisdictionType')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ complaints, total: complaints.length });
  } catch (err) {
    next(err);
  }
});

// Manual assign a complaint to a department
router.post('/complaints/:id/assign', requireAuth, requireRole('admin'), validateParams(objectIdParam), validate(assignSchema), async (req, res, next) => {
  try {
    const { departmentId, note } = req.validated;

    const complaint = await Complaint.findById(req.validatedParams.id)
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes departmentParts locationSource locationConfidence matchedLandmark routingVerification');
    if (!complaint) {
      return res.status(404).json({ error: { message: 'Complaint not found', status: 404 } });
    }

    const department = await Department.findById(departmentId).select('_id nameEn nameBn jurisdictionType').lean();
    if (!department) {
      return res.status(404).json({ error: { message: 'Department not found', status: 404 } });
    }

    // Save routing correction if there was a previous primary department
    const originalPrimary = complaint.routing.find((r) => r.isPrimary);
    if (originalPrimary && originalPrimary.department.toString() !== departmentId) {
      await RoutingCorrection.create({
        complaint: complaint._id,
        originalDepartment: originalPrimary.department,
        correctedDepartment: departmentId,
        correctedBy: req.dbUser._id,
      });
    }

    // Update routing
    complaint.routing = [
      {
        department: departmentId,
        isPrimary: true,
        assignedBy: 'manual',
        reason: note || 'Manual assignment by admin',
      },
      ...complaint.routing.filter((r) => !r.isPrimary),
    ];

    complaint.status = 'assigned';
    complaint.statusLog.push({
      status: 'assigned',
      note: note || `Manually assigned to ${department.nameEn}`,
      actor: req.dbUser.name || req.dbUser.email,
      at: new Date(),
    });

    await complaint.save();

    const lean = complaint.toObject();
    res.status(200).json({ complaint: lean });
  } catch (err) {
    next(err);
  }
});

// Re-route a complaint to a different department
router.post('/complaints/:id/reroute', requireAuth, requireRole('admin'), validateParams(objectIdParam), validate(rerouteSchema), async (req, res, next) => {
  try {
    const { newDepartmentId, note } = req.validated;

    const complaint = await Complaint.findById(req.validatedParams.id)
      .select('_id trackingId category description area urgency status confidence location attachments statusLog routing citizen draftId source createdAt updatedAt slaDeadline supporters upvotes downvotes departmentParts locationSource locationConfidence matchedLandmark routingVerification');
    if (!complaint) {
      return res.status(404).json({ error: { message: 'Complaint not found', status: 404 } });
    }

    const newDept = await Department.findById(newDepartmentId).select('_id nameEn nameBn jurisdictionType').lean();
    if (!newDept) {
      return res.status(404).json({ error: { message: 'Department not found', status: 404 } });
    }

    // Find original primary
    const originalPrimary = complaint.routing.find((r) => r.isPrimary);
    const originalDeptId = originalPrimary ? originalPrimary.department : null;

    // Save routing correction
    if (originalDeptId && originalDeptId.toString() !== newDepartmentId) {
      await RoutingCorrection.create({
        complaint: complaint._id,
        originalDepartment: originalDeptId,
        correctedDepartment: newDepartmentId,
        correctedBy: req.dbUser._id,
      });
    }

    // Update routing: replace primary
    complaint.routing = complaint.routing.map((r) => {
      if (r.isPrimary) {
        return {
          department: newDepartmentId,
          isPrimary: true,
          assignedBy: 'manual',
          reason: note || `Re-routed to ${newDept.nameEn} by admin`,
        };
      }
      return r;
    });

    // If no primary existed, add one
    if (!complaint.routing.some((r) => r.isPrimary)) {
      complaint.routing.unshift({
        department: newDepartmentId,
        isPrimary: true,
        assignedBy: 'manual',
        reason: note || `Re-routed to ${newDept.nameEn} by admin`,
      });
    }

    complaint.status = 'assigned';
    complaint.statusLog.push({
      status: 'assigned',
      note: note || `Re-routed to ${newDept.nameEn}`,
      actor: req.dbUser.name || req.dbUser.email,
      at: new Date(),
    });

    await complaint.save();

    const lean = complaint.toObject();
    res.status(200).json({ complaint: lean });
  } catch (err) {
    next(err);
  }
});

// List all complaints (admin)
router.get('/complaints', requireAuth, requireRole('admin'), validateQuery(complaintsQuerySchema), async (req, res, next) => {
  try {
    const { urgency, status, area, from, to } = req.validatedQuery;
    const filter = {};

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
      .populate('routing.department', '_id nameEn nameBn jurisdictionType')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ complaints, total: complaints.length });
  } catch (err) {
    next(err);
  }
});

export default router;
