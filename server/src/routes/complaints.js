import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Complaint } from '../models/Complaint.js';
import { Department } from '../models/Department.js';
import { Draft } from '../models/Draft.js';
import { extractComplaint } from '../services/extraction.js';
import { routeComplaint } from '../services/routing.js';
import { fireNotifications } from '../services/notify.js';import { checkSpam } from '../utils/spam.js';
import { findDuplicates, addSupporter } from '../services/duplicate.js';import { validate } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
const router = express.Router();

// Rate limiter: 5 submissions per hour per IP
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: { message: 'Too many submissions, try again later', status: 429 } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zod schemas
const draftSchema = z.object({
  text: z.string().optional().default(''),
  transcript: z.string().optional().default(''),
  area: z.string().optional().default(''),
  photoIds: z.array(z.string()).optional().default([]),
  audioPath: z.string().optional().default(''),
  photoPath: z.string().optional().default(''),
  lat: z.number().optional(),
  lng: z.number().optional(),
  contactPhone: z.string().optional().default(''),
  contactEmail: z.string().optional().default(''),
  language: z.enum(['bn', 'en', 'banglish']).optional().default('bn'),
});

const answerSchema = z.object({
  answers: z.record(z.string()).optional().default({}),
});

const submitSchema = z.object({
  draftId: z.string().min(1),
  force: z.boolean().optional().default(false),
});

// Helper: generate tracking ID
const generateTrackingId = async () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `DHK-${dateStr}-`;

  // Find highest existing sequence for today
  const lastComplaint = await Complaint.findOne({
    trackingId: { $regex: `^${prefix}` },
  }).sort({ trackingId: -1 });

  let seq = 1;
  if (lastComplaint) {
    const lastSeq = parseInt(lastComplaint.trackingId.split('-').pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// Area to coordinates mapping for Dhaka
const AREA_COORDS = {
  'Uttara': [90.38, 23.87], 'Mirpur': [90.36, 23.81], 'Gulshan': [90.42, 23.79],
  'Banani': [90.40, 23.79], 'Baridhara': [90.42, 23.80], 'Badda': [90.43, 23.78],
  'Rampura': [90.42, 23.76], 'Mohakhali': [90.40, 23.78], 'Tejgaon': [90.40, 23.76],
  'Kafrul': [90.37, 23.80], 'Cantonment': [90.39, 23.82], 'Dhanmondi': [90.37, 23.75],
  'Motijheel': [90.42, 23.73], 'Old Dhaka': [90.40, 23.71], 'Jatrabari': [90.43, 23.71],
  'Wari': [90.41, 23.72], 'Lalbagh': [90.39, 23.72], 'Sutrapur': [90.42, 23.71],
  'Gendaria': [90.43, 23.70], 'Shyampur': [90.44, 23.69], 'Demra': [90.47, 23.71],
  'Kadamtali': [90.45, 23.69], 'Mohammadpur': [90.36, 23.76], 'Adabar': [90.35, 23.77],
  'Hazaribagh': [90.36, 23.73], 'Savar': [90.26, 23.85],
};

const resolveCoords = (area) => {
  if (AREA_COORDS[area]) {
    const [lng, lat] = AREA_COORDS[area];
    return { lat, lng };
  }
  return null;
};

// Helper: build merged text from inputs
const buildMergedText = (inputs) => {
  const parts = [];
  if (inputs.text) parts.push(inputs.text.trim());
  if (inputs.transcript && inputs.transcript.trim() !== inputs.text?.trim()) parts.push(inputs.transcript.trim());
  if (inputs.area) parts.push(inputs.area.trim());
  return [...new Set(parts)].join(' ').trim();
};

// Helper: generate follow-up questions (max 2) based on missing fields and language
const generateFollowUpQuestions = (missingFields, language) => {
  const questions = [];
  const isBn = language === 'bn' || language === 'banglish';

  if (missingFields.includes('area')) {
    questions.push(
      isBn
        ? 'আপনি কোন এলাকায় আছেন? (যেমন: গুলশান, মিরপুর, ধানমন্ডি)'
        : 'Which area are you in? (e.g., Gulshan, Mirpur, Dhanmondi)'
    );
  }

  if (missingFields.includes('contactPhone')) {
    questions.push(
      isBn
        ? 'আপনার ফোন নম্বর দিন (ঐচ্ছিক, আপডেট পেতে)'
        : 'Your phone number (optional, for updates)'
    );
  }

  // If no specific missing fields, ask for more details
  if (questions.length === 0 && missingFields.length > 0) {
    const field = missingFields[0];
    questions.push(
      isBn
        ? `আরও বিস্তারিত জানান: ${field}`
        : `Please provide more details: ${field}`
    );
  }

  return questions.slice(0, 2);
};

// Helper: check conflicts between text and photo categories
const checkConflicts = (extracted, photoAnalyses) => {
  const conflicts = [];
  if (!photoAnalyses || photoAnalyses.length === 0) return conflicts;

  for (const pa of photoAnalyses) {
    if (pa.suggestedCategory && pa.suggestedCategory !== extracted.category && pa.isRelevant) {
      conflicts.push({
        type: 'category_mismatch',
        textCategory: extracted.category,
        photoCategory: pa.suggestedCategory,
        message: `Text suggests "${extracted.category}" but photo suggests "${pa.suggestedCategory}"`,
      });
    }
  }
  return conflicts;
};

// POST /api/complaints/draft
router.post('/draft', validate(draftSchema), async (req, res, next) => {
  try {
    const inputs = req.validated;

    // Spam check
    const mergedText = buildMergedText(inputs);
    const spamResult = checkSpam(mergedText);
    if (spamResult.isSpam) {
      return res.status(400).json({
        error: { message: 'Spam detected: ' + spamResult.reason, status: 400 },
      });
    }

    // Run extraction
    const extracted = await extractComplaint({ text: mergedText });

    // Build location (from lat/lng or resolve from area)
    let location = inputs.lat && inputs.lng ? { lat: inputs.lat, lng: inputs.lng } : null;
    if (!location && inputs.area) {
      location = resolveCoords(inputs.area);
    }
    if (!location && extracted.area) {
      location = resolveCoords(extracted.area);
    }

    // Run routing
    const routing = await routeComplaint(extracted, location);

    // Get department names for routing response
    const primaryDept = routing.primaryDepartmentId
      ? await Department.findById(routing.primaryDepartmentId).lean()
      : null;
    const secondaryDepts = await Department.find({
      _id: { $in: routing.secondaryDepartmentIds },
    }).lean();

    // Generate follow-up questions
    const followUpQuestions = generateFollowUpQuestions(extracted.missingFields, inputs.language);

    // Check conflicts (placeholder - photo analyses would come from photoIds)
    const conflicts = checkConflicts(extracted, []);

    // Store draft
    const sessionId = uuidv4();
    const draftData = {
      inputs,
      extracted,
      routing: {
        primaryDepartmentId: routing.primaryDepartmentId,
        secondaryDepartmentIds: routing.secondaryDepartmentIds,
        confidence: routing.confidence,
        method: routing.method,
        reasoning: routing.reasoning,
        needsTriage: routing.needsTriage,
      },
      missingFields: extracted.missingFields,
      followUpQuestions,
      conflicts,
      confirmed: false,
    };

    const draft = await Draft.create({ sessionId, data: draftData });

    res.status(201).json({
      draftId: draft.sessionId,
      extracted,
      routing: {
        primary: primaryDept
          ? { id: primaryDept._id, nameEn: primaryDept.nameEn, nameBn: primaryDept.nameBn }
          : null,
        secondary: secondaryDepts.map((d) => ({
          id: d._id,
          nameEn: d.nameEn,
          nameBn: d.nameBn,
        })),
        confidence: routing.confidence,
        method: routing.method,
        reasoning: routing.reasoning,
        needsTriage: routing.needsTriage,
      },
      missingFields: extracted.missingFields,
      followUpQuestions,
      conflicts,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/complaints/draft/:id/answer
router.post('/draft/:id/answer', validate(answerSchema), async (req, res, next) => {
  try {
    const draft = await Draft.findOne({ sessionId: req.params.id });
    if (!draft) {
      return res.status(404).json({ error: { message: 'Draft not found', status: 404 } });
    }

    const { answers } = req.validated;

    // Apply answers to inputs
    const inputs = { ...draft.data.inputs };
    if (answers.text) inputs.text = (inputs.text || '') + ' ' + answers.text;
    if (answers.area) {
      inputs.area = answers.area;
      inputs.text = (inputs.text || '') + ' ' + answers.area;
    }
    if (answers.contactPhone) inputs.contactPhone = answers.contactPhone;
    if (answers.contactEmail) inputs.contactEmail = answers.contactEmail;
    if (answers.transcript) inputs.transcript = (inputs.transcript || '') + ' ' + answers.transcript;

    const mergedText = buildMergedText(inputs);
    const spamResult = checkSpam(mergedText);
    if (spamResult.isSpam) {
      return res.status(400).json({
        error: { message: 'Spam detected: ' + spamResult.reason, status: 400 },
      });
    }

    const extracted = await extractComplaint({ text: mergedText });

    let location = inputs.lat && inputs.lng ? { lat: inputs.lat, lng: inputs.lng } : null;
    if (!location && inputs.area) location = resolveCoords(inputs.area);
    if (!location && extracted.area) location = resolveCoords(extracted.area);

    const routing = await routeComplaint(extracted, location);

    const primaryDept = routing.primaryDepartmentId
      ? await Department.findById(routing.primaryDepartmentId).lean()
      : null;
    const secondaryDepts = await Department.find({
      _id: { $in: routing.secondaryDepartmentIds },
    }).lean();

    const followUpQuestions = generateFollowUpQuestions(extracted.missingFields, inputs.language);
    const conflicts = checkConflicts(extracted, []);

    // Update draft
    draft.data = {
      ...draft.data,
      inputs,
      extracted,
      routing: {
        primaryDepartmentId: routing.primaryDepartmentId,
        secondaryDepartmentIds: routing.secondaryDepartmentIds,
        confidence: routing.confidence,
        method: routing.method,
        reasoning: routing.reasoning,
        needsTriage: routing.needsTriage,
      },
      missingFields: extracted.missingFields,
      followUpQuestions,
      conflicts,
    };
    draft.markModified('data');
    await draft.save();

    res.status(200).json({
      draftId: draft.sessionId,
      extracted,
      routing: {
        primary: primaryDept
          ? { id: primaryDept._id, nameEn: primaryDept.nameEn, nameBn: primaryDept.nameBn }
          : null,
        secondary: secondaryDepts.map((d) => ({
          id: d._id,
          nameEn: d.nameEn,
          nameBn: d.nameBn,
        })),
        confidence: routing.confidence,
        method: routing.method,
        reasoning: routing.reasoning,
        needsTriage: routing.needsTriage,
      },
      missingFields: extracted.missingFields,
      followUpQuestions,
      conflicts,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/complaints/check-duplicate
const checkDuplicateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  category: z.string().optional(),
  area: z.string().optional(),
});

router.post('/check-duplicate', validate(checkDuplicateSchema), async (req, res, next) => {
  try {
    const { lat, lng, category, area } = req.validated;
    const duplicates = await findDuplicates({ lat, lng, category: category || 'road', area });
    res.status(200).json({
      hasDuplicates: duplicates.length > 0,
      duplicates: duplicates.map((d) => ({
        trackingId: d.trackingId,
        category: d.category,
        area: d.area,
        description: d.description,
        urgency: d.urgency,
        supporters: d.supporters,
        createdAt: d.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/complaints/:trackingId/support
router.post('/:trackingId/support', async (req, res, next) => {
  try {
    const complaint = await addSupporter(req.params.trackingId);
    res.status(200).json({
      trackingId: complaint.trackingId,
      supporters: complaint.supporters,
      message: 'Support added',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/complaints/submit
const submitMiddlewares = (env.NODE_ENV === 'test' || env.MOCK_LLM)
  ? [validate(submitSchema)]
  : [submitLimiter, validate(submitSchema)];
router.post('/submit', ...submitMiddlewares, async (req, res, next) => {
  try {
    const { draftId } = req.validated;

    const draft = await Draft.findOne({ sessionId: draftId });
    if (!draft) {
      return res.status(404).json({ error: { message: 'Draft not found', status: 404 } });
    }

    const { inputs, extracted, routing: routingData } = draft.data;

    // Duplicate detection (unless forced)
    // Resolve location for duplicate check
    let submitLat = inputs.lat;
    let submitLng = inputs.lng;
    if (!submitLat || !submitLng) {
      const coords = resolveCoords(inputs.area) || resolveCoords(extracted.area);
      if (coords) { submitLat = coords.lat; submitLng = coords.lng; }
    }

    if (!req.validated.force && submitLat && submitLng) {
      const duplicates = await findDuplicates({
        lat: submitLat,
        lng: submitLng,
        category: extracted.category,
        area: extracted.area,
      });
      if (duplicates.length > 0) {
        return res.status(200).json({
          duplicate: true,
          message: 'Similar complaint found nearby. Add +1 to existing report?',
          duplicates: duplicates.map((d) => ({
            trackingId: d.trackingId,
            category: d.category,
            area: d.area,
            description: d.description,
            urgency: d.urgency,
            supporters: d.supporters,
            createdAt: d.createdAt,
          })),
        });
      }
    }

    // Generate tracking ID
    const trackingId = await generateTrackingId();

    // Determine status
    const needsTriage = routingData.needsTriage;
    const initialStatus = needsTriage ? 'triage' : 'received';

    // Build routing entries
    const routingEntries = [];
    if (routingData.primaryDepartmentId) {
      routingEntries.push({
        department: routingData.primaryDepartmentId,
        isPrimary: true,
        assignedBy: 'auto',
        reason: routingData.reasoning || 'Auto-routed',
      });
    }
    for (const secId of routingData.secondaryDepartmentIds || []) {
      routingEntries.push({
        department: secId,
        isPrimary: false,
        assignedBy: 'auto',
        reason: 'Secondary department for multi-department issue',
      });
    }

    // Build status log
    const statusLog = [{ status: initialStatus, note: 'Complaint received', actor: 'system', at: new Date() }];
    if (!needsTriage && routingData.primaryDepartmentId) {
      statusLog.push({ status: 'assigned', note: 'Auto-assigned to department', actor: 'system', at: new Date() });
    }

    const finalStatus = !needsTriage && routingData.primaryDepartmentId ? 'assigned' : initialStatus;

    const complaint = await Complaint.create({
      trackingId,
      rawText: buildMergedText(inputs),
      transcript: inputs.transcript || '',
      category: extracted.category,
      description: extracted.description,
      descriptionBn: extracted.descriptionBn,
      area: extracted.area || inputs.area || 'Unknown',
      ward: extracted.ward,
      landmark: extracted.landmark,
      location: (() => {
        const lat = inputs.lat || (resolveCoords(inputs.area) || resolveCoords(extracted.area))?.lat;
        const lng = inputs.lng || (resolveCoords(inputs.area) || resolveCoords(extracted.area))?.lng;
        if (lat && lng) return { type: 'Point', coordinates: [lng, lat] };
        return { type: 'Point', coordinates: [90.4125, 23.8103] };
      })(),
      urgency: extracted.urgency,
      status: finalStatus,
      confidence: routingData.confidence,
      contactPhone: inputs.contactPhone || extracted.contactPhone || '',
      contactEmail: inputs.contactEmail || extracted.contactEmail || '',
      language: extracted.languageDetected,
      attachments: [
        ...(inputs.photoPath ? [{ type: 'photo', path: inputs.photoPath, meta: {} }] : []),
        ...(inputs.audioPath ? [{ type: 'audio', path: inputs.audioPath, meta: { language: extracted.languageDetected } }] : []),
      ],
      routing: routingEntries,
      statusLog,
    });

    // Mark draft as confirmed
    draft.data.confirmed = true;
    draft.markModified('data');
    await draft.save();

    // Trigger notifications asynchronously
    const primaryDept = routingData.primaryDepartmentId
      ? await Department.findById(routingData.primaryDepartmentId).lean()
      : null;

    if (primaryDept) {
      fireNotifications(complaint.toObject(), primaryDept);
    }

    logger.info({ trackingId, status: finalStatus }, 'Complaint submitted');

    res.status(201).json({ trackingId });
  } catch (err) {
    next(err);
  }
});

// GET /api/complaints/search?q=... - public search by tracking ID, area, category, description
// Bangla ↔ English term map so searches work in either language
const SEARCH_TERM_MAP = {
  'গর্ত': 'pothole', 'রাস্তা': 'road', 'ময়লা': 'garbage', 'আবর্জনা': 'waste',
  'মশা': 'mosquito', 'ডেঙ্গু': 'dengue', 'বাতি': 'streetlight', 'পানি': 'water',
  'জলাবদ্ধতা': 'waterlogging', 'ড্রেন': 'drain', 'বিদ্যুৎ': 'electricity',
  'গ্যাস': 'gas', 'ট্রাফিক': 'traffic', 'জ্যাম': 'jam', 'অবৈধ নির্মাণ': 'construction',
  'ভবন': 'building', 'নির্মাণ': 'construction', 'আগুন': 'fire', 'দূষণ': 'pollution',
  'গুলশান': 'gulshan', 'ধানমন্ডি': 'dhanmondi', 'মিরপুর': 'mirpur', 'উত্তরা': 'uttara',
  'বনানী': 'banani', 'মতিঝিল': 'motijheel', 'যাত্রাবাড়ী': 'jatrabari', 'পুরান ঢাকা': 'old dhaka',
  'মোহাম্মদপুর': 'mohammadpur', 'তেজগাঁও': 'tejgaon', 'বারিধারা': 'baridhara',
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(200).json({ results: [] });

    // Try original query plus mapped English/Bangla equivalents
    const lower = q.toLowerCase();
    const terms = [q];
    for (const [bn, en] of Object.entries(SEARCH_TERM_MAP)) {
      if (bn === q || lower === bn) terms.push(en);
      if (en === lower || q.toLowerCase() === en) terms.push(bn);
    }

    const orClauses = [];
    for (const term of terms) {
      const t = escapeRegex(term);
      orClauses.push(
        { trackingId: new RegExp(t, 'i') },
        { area: new RegExp(t, 'i') },
        { category: new RegExp(t, 'i') },
        { description: new RegExp(t, 'i') },
        { descriptionBn: new RegExp(t, 'i') },
      );
    }

    const results = await Complaint.find({ $or: orClauses })
      .select('trackingId category area description status urgency createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});

// GET /api/complaints/map - public map data
router.get('/map', async (req, res, next) => {
  try {
    const { category, status, urgency } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (urgency) filter.urgency = urgency;

    const complaints = await Complaint.find(filter)
      .select('trackingId category status urgency area location createdAt supporters')
      .lean();

    const markers = complaints
      .filter((c) => c.location?.coordinates?.length === 2)
      .map((c) => ({
        trackingId: c.trackingId,
        category: c.category,
        status: c.status,
        urgency: c.urgency,
        area: c.area,
        lat: c.location.coordinates[1],
        lng: c.location.coordinates[0],
        supporters: c.supporters,
        createdAt: c.createdAt,
      }));

    res.status(200).json({ markers, total: markers.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/complaints/:trackingId/report - JSON + minimal formal report
import { generateReport } from '../services/report.js';
router.get('/:trackingId/report', async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne({ trackingId: req.params.trackingId })
      .populate('routing.department')
      .lean();
    if (!complaint) {
      return res.status(404).json({ error: { message: 'Complaint not found', status: 404 } });
    }

    const result = generateReport(complaint);
    if (!result.ok) {
      return res.status(200).json({ ok: false, missing: result.missing });
    }
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/complaints/track/:trackingId
router.get('/track/:trackingId', async (req, res, next) => {
  try {
    const complaint = await Complaint.findOne({ trackingId: req.params.trackingId })
      .select('trackingId category description area urgency status statusLog createdAt updatedAt')
      .lean();

    if (!complaint) {
      return res.status(404).json({ error: { message: 'Complaint not found', status: 404 } });
    }

    res.status(200).json({
      trackingId: complaint.trackingId,
      category: complaint.category,
      description: complaint.description,
      area: complaint.area,
      urgency: complaint.urgency,
      status: complaint.status,
      timeline: (complaint.statusLog || []).map((entry) => ({
        status: entry.status,
        note: entry.note,
        at: entry.at,
      })),
      createdAt: complaint.createdAt,
      updatedAt: complaint.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
