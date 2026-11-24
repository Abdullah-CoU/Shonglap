import { Department } from '../models/Department.js';
import { Jurisdiction } from '../models/Jurisdiction.js';
import { pickDepartmentForProblem } from './routing.js';
import { resolveLandmark } from './geocode.js';

/**
 * Automatic problem segmentation.
 * A single citizen statement can contain several distinct civic problems.
 * Each problem is detected from the text, classified into a category and
 * routed to the department that owns it. No manual department picking.
 */

const CATEGORY_KEYWORDS = {
  gas: ['gas', 'gas leak', 'গ্যাস', 'গ্যাস লিক'],
  electricity: ['electric', 'electricity', 'power', 'outage', 'transformer', 'live wire', 'hanging wire', 'voltage', 'বিদ্যুৎ', 'লোডশেডিং', 'লোড শেডিং', 'তার', 'বাতি', 'bijli', 'bidyut'],
  waterlogging: ['waterlog', 'waterlogged', 'waterlogging', 'জলাবদ্ধতা', 'প্লাবন'],
  sewerage: ['sewer', 'sewage', 'drain', 'নিকাশি', 'সুয়ারেজ', 'ড্রেন'],
  water: ['water', 'tap', 'pipe', 'পানি', 'ওয়াসা', 'pani', 'wasa'],
  pollution: ['pollution', 'factory', 'industrial', 'দূষণ', 'ধোঁয়া'],
  noise: ['noise', 'loud', 'sound', 'শব্দ'],
  garbage: ['garbage', 'waste', 'trash', 'dustbin', 'ময়লা', 'আবর্জনা', 'moyla'],
  mosquito: ['mosquito', 'dengue', 'মশা', 'ডেঙ্গু', 'mosha'],
  fire: ['fire', 'blaze', 'burn', 'আগুন', 'অগ্নিকাণ্ড'],
  streetlight: ['streetlight', 'street light', 'lamp', 'বাতি', 'bati'],
  road: ['pothole', 'road', 'footpath', 'highway', 'bridge', 'flyover', 'গর্ত', 'রাস্তা', 'রোড', 'ফুটপাথ', 'rasta', 'gor'],
  traffic: ['traffic', 'signal', 'parking', 'congestion', 'zebra', 'ট্রাফিক', 'জ্যাম', 'সিগন্যাল'],
  construction: ['construction', 'building', 'unauthorized', 'illegal construction', 'নির্মাণ', 'ভবন', 'অবৈধ', 'রাজউক', 'rajuk'],
  crime: ['police', 'crime', 'theft', 'robbery', 'পুলিশ', 'অপরাধ', 'চুরি'],
};

const CONNECTORS = [
  /\s+এবং\s+/, /\s+আর\s+/, /\s+এছাড়া\s+/, /\s+এছাড়া\s+/,
  /\s+and\s+/, /\s+also\s+/, /;\s*/, /,\s+(?=(?:there|also|and|plus|রাস্তা|পানি|বিদ্যুৎ|গর্ত|ময়লা|মশা|আবর্জনা|এবং))/i,
];

/** Does the text mention any civic problem keyword? */
function hasCivicKeyword(text) {
  const lower = String(text || '').toLowerCase();
  return Object.values(CATEGORY_KEYWORDS).some((words) => words.some((w) => lower.includes(w)));
}

/** Detect a single category from text (specific categories first). */
export function detectCategory(text) {
  const lower = String(text || '').toLowerCase();
  const order = ['gas', 'electricity', 'waterlogging', 'sewerage', 'fire', 'mosquito', 'garbage', 'streetlight', 'pollution', 'noise', 'construction', 'traffic', 'crime', 'road', 'water'];
  for (const category of order) {
    if (CATEGORY_KEYWORDS[category].some((w) => lower.includes(w))) return category;
  }
  return '';
}

/** Split a statement into distinct problem sentences/clauses. */
export function splitIntoProblems(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  let sentences = normalized.split(/(?<=[।.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

  // Further split on connectors when both sides look like real problems.
  const expanded = [];
  for (const sentence of sentences) {
    let pieces = [sentence];
    for (const connector of CONNECTORS) {
      const next = [];
      for (const piece of pieces) {
        const parts = piece.split(connector).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 1 && parts.every(hasCivicKeyword)) next.push(...parts);
        else next.push(piece);
      }
      pieces = next;
    }
    expanded.push(...pieces);
  }

  return expanded.filter(hasCivicKeyword);
}

/** Rough per-problem urgency from keywords. */
function detectUrgency(text, fallback = 'medium') {
  const lower = String(text || '').toLowerCase();
  if (/gas leak|লিক|live wire|open manhole|fire|আগুন|collapse|ধস|explosion|বিস্ফোরণ/.test(lower)) return 'critical';
  if (/no water|পানি নেই|outage|নেই|waterlog|জলাবদ্ধ|dengue|ডেঙ্গু|smell|গন্ধ|huge|বড়/.test(lower)) return 'high';
  return fallback;
}

/**
 * Segment a complaint into routed parts.
 *
 * @param {Object} params
 * @param {string} params.text - Combined citizen text (voice transcript + typed text).
 * @param {Object} [params.extracted] - Extracted complaint (area, urgency fallback).
 * @param {Object} [params.location] - Location object.
 * @param {string} [params.fallbackDepartmentId] - Overall routing decision, used when a segment has no keyword match.
 * @returns {Promise<Array<{description:string, category:string, departmentId:string|null, jurisdictionType:string, aspect:string, urgency:string, confidence:number, reason:string}>>}
 */
export async function segmentComplaint({ text, extracted = {}, location = null, fallbackDepartmentId = '' } = {}) {
  const problems = splitIntoProblems(text);
  if (problems.length === 0) return [];

  const departments = await Department.find({})
    .select('_id nameEn nameBn responsibilities keywords jurisdictionType slaHours').lean();
  const jurisdictions = await Jurisdiction.find({})
    .select('_id department areaName wards verified').populate('department', '_id nameEn nameBn jurisdictionType').lean();

  const parts = [];
  for (const description of problems) {
    const category = detectCategory(description) || extracted.category || 'road';

    // A landmark in this specific problem overrides the complaint-level area.
    const localLandmark = resolveLandmark(description);
    const segmentExtracted = {
      ...extracted,
      area: localLandmark?.area || extracted.area || '',
      ward: localLandmark?.ward ?? extracted.ward ?? null,
    };
    const segmentLocation = localLandmark
      ? { lat: localLandmark.lat, lng: localLandmark.lng }
      : location;

    const pick = await pickDepartmentForProblem(description, category, {
      departments,
      jurisdictions,
      extracted: segmentExtracted,
      location: segmentLocation,
    });

    parts.push({
      description,
      category,
      urgency: detectUrgency(description, extracted.urgency || 'medium'),
      departmentId: pick.departmentId || fallbackDepartmentId || null,
      landmark: localLandmark?.landmark || '',
      jurisdictionType: pick.jurisdictionType,
      aspect: pick.nameEn,
      confidence: pick.confidence,
      reason: pick.reason,
    });
  }

  return parts;
}
