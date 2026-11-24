import { z } from 'zod';
import { Department } from '../models/Department.js';
import { Jurisdiction } from '../models/Jurisdiction.js';
import { callClaudeJson } from './llm.js';
import { env } from '../config/env.js';

/**
 * @typedef {Object} RoutingDecision
 * @property {string|null} primaryDepartmentId
 * @property {string[]} secondaryDepartmentIds
 * @property {number} confidence
 * @property {'rule'|'llm'|'triage'} method
 * @property {string} reasoning
 * @property {boolean} needsTriage
 */

export const routingSchema = z.object({
  primary: z.string(),
  secondary: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  reasoning: z.string().default(''),
});

const AREA_CENTROIDS = {
  'Uttara': [90.38, 23.87],
  'Mirpur': [90.36, 23.81],
  'Gulshan': [90.42, 23.79],
  'Banani': [90.40, 23.79],
  'Baridhara': [90.42, 23.80],
  'Badda': [90.43, 23.78],
  'Rampura': [90.42, 23.76],
  'Mohakhali': [90.40, 23.78],
  'Tejgaon': [90.40, 23.76],
  'Kafrul': [90.37, 23.80],
  'Cantonment': [90.39, 23.82],
  'Dhanmondi': [90.37, 23.75],
  'Motijheel': [90.42, 23.73],
  'Old Dhaka': [90.40, 23.71],
  'Jatrabari': [90.43, 23.71],
  'Wari': [90.41, 23.72],
  'Lalbagh': [90.39, 23.72],
  'Sutrapur': [90.42, 23.71],
  'Gendaria': [90.43, 23.70],
  'Shyampur': [90.44, 23.69],
  'Demra': [90.47, 23.71],
  'Kadamtali': [90.45, 23.69],
  'Mohammadpur': [90.36, 23.76],
  'Adabar': [90.35, 23.77],
  'Hazaribagh': [90.36, 23.73],
};

const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeLocation = (location) => {
  if (!location) return null;
  if (location.lat != null && location.lng != null) return { lat: location.lat, lng: location.lng };
  if (location.latitude != null && location.longitude != null) return { lat: location.latitude, lng: location.longitude };
  if (Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
    return { lat: location.coordinates[1], lng: location.coordinates[0] };
  }
  if (Array.isArray(location) && location.length >= 2) {
    return { lat: location[1], lng: location[0] };
  }
  return null;
};

const buildSearchText = (extracted) => {
  return [
    extracted.description || '',
    extracted.descriptionBn || '',
    extracted.area || '',
    extracted.landmark || '',
    extracted.category || '',
    extracted.urgencyReason || '',
  ]
    .join(' ')
    .toLowerCase();
};

const CATEGORY_DEPT_BOOST = {
  road: ['DNCC', 'DSCC'],
  garbage: ['DNCC', 'DSCC'],
  mosquito: ['DNCC', 'DSCC'],
  streetlight: ['DNCC', 'DSCC'],
  water: ['WASA'],
  sewerage: ['WASA'],
  waterlogging: ['WASA'],
  electricity: ['DPDC', 'DESCO'],
  gas: ['Titas'],
  construction: ['RAJUK'],
  crime: ['Police'],
  traffic: ['Traffic'],
  fire: ['Fire'],
  pollution: ['DOE'],
  noise: ['DOE'],
};

const countKeywordMatches = (keywords, text) => {
  let count = 0;
  for (const kw of keywords || []) {
    if (text.includes(kw.toLowerCase())) count++;
  }
  return count;
};

export const scoreDepartment = (dept, searchText, category) => {
  let score = countKeywordMatches(dept.keywords, searchText);
  const boostTypes = CATEGORY_DEPT_BOOST[category] || [];
  if (boostTypes.includes(dept.jurisdictionType)) {
    score += 5; // strong category boost
  }
  // RHD boost for highway-related terms
  if (dept.jurisdictionType === 'RHD' && (searchText.includes('highway') || searchText.includes('national road') || searchText.includes('expressway') || searchText.includes('flyover') || searchText.includes('overpass'))) {
    score += 10;
  }
  // Reduce city corp boost when highway terms present (RHD should win)
  if (['DNCC', 'DSCC'].includes(dept.jurisdictionType) && (searchText.includes('highway') || searchText.includes('national road') || searchText.includes('expressway'))) {
    score -= 3;
  }
  // Traffic boost for traffic-specific terms (even if category is road)
  if (dept.jurisdictionType === 'Traffic' && (searchText.includes('signal') || searchText.includes('parking') || searchText.includes('congestion') || searchText.includes('tow'))) {
    score += 3;
  }
  return score;
};

const findNearestArea = (lat, lng) => {
  let nearest = null;
  let minDist = Infinity;
  for (const [area, [aLng, aLat]] of Object.entries(AREA_CENTROIDS)) {
    const dist = haversine(lat, lng, aLat, aLng);
    if (dist < minDist) {
      minDist = dist;
      nearest = area;
    }
  }
  return minDist <= 5 ? nearest : null;
};

export const resolveJurisdiction = (candidateTypes, departments, jurisdictions, extracted, location) => {
  const candidateDeptIds = departments
    .filter((d) => candidateTypes.includes(d.jurisdictionType))
    .map((d) => d._id.toString());

  let area = extracted.area || '';
  if (!area && location) {
    area = findNearestArea(location.lat, location.lng) || '';
  }

  if (area) {
    const match = jurisdictions.find(
      (j) =>
        j.areaName.toLowerCase() === area.toLowerCase() &&
        candidateDeptIds.includes(j.department?._id?.toString() || j.department?.toString())
    );
    if (match) return match.department?._id?.toString() || match.department?.toString();

    const fuzzy = jurisdictions.find(
      (j) =>
        j.areaName.toLowerCase().includes(area.toLowerCase()) &&
        candidateDeptIds.includes(j.department?._id?.toString() || j.department?.toString())
    );
    if (fuzzy) return fuzzy.department?._id?.toString() || fuzzy.department?.toString();
  }

  if (extracted.ward) {
    const wardMatch = jurisdictions.find(
      (j) =>
        Array.isArray(j.wards) &&
        j.wards.includes(extracted.ward) &&
        candidateDeptIds.includes(j.department?._id?.toString() || j.department?.toString())
    );
    if (wardMatch) return wardMatch.department?._id?.toString() || wardMatch.department?.toString();
  }

  return null;
};

const isJurisdictionType = (type) => ['DNCC', 'DSCC', 'DPDC', 'DESCO'].includes(type);

const mockClassify = (extracted, departments, searchText) => {
  const scores = departments.map((d) => ({
    dept: d,
    score: scoreDepartment(d, searchText, extracted.category),
  }));
  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0]?.score || 0;
  if (topScore === 0) {
    return { primary: null, secondary: [], confidence: 0.3, reasoning: 'No keyword matches found' };
  }

  const topDepts = scores.filter((s) => s.score === topScore);
  const primaryDept = topDepts[0].dept;
  const confidence = topDepts.length === 1 ? 0.85 : 0.6;

  return {
    primary: primaryDept._id.toString(),
    secondary: [],
    confidence,
    reasoning: `Mock LLM: best keyword match ${primaryDept.nameEn} (score ${topScore})`,
  };
};

const callLLMClassifier = async (extracted, departments, searchText) => {
  const deptList = departments
    .map((d) => `ID: ${d._id} | ${d.nameEn} (${d.nameBn}) | Responsibilities: ${d.responsibilities}`)
    .join('\n');

  const system = `You are a civic complaint routing classifier for Dhaka, Bangladesh.
Given a complaint and a list of departments, determine the primary department, secondary departments (if any), confidence (0-1), and reasoning.
Return ONLY valid JSON. No markdown, no explanation.

JSON format:
{"primary": "<department id>", "secondary": ["<dept id>"], "confidence": 0.85, "reasoning": "..."}

Rules:
- primary must be one of the department IDs provided
- secondary is an array of department IDs (can be empty)
- confidence is a number between 0 and 1
- reasoning is a brief explanation
- Discard any department ID not in the provided list`;

  const userMessage = `Complaint: ${extracted.description}
Category: ${extracted.category}
Area: ${extracted.area || 'unknown'}
Urgency: ${extracted.urgency}

Departments:
${deptList}

Classify this complaint and return JSON.`;

  try {
    const result = await callClaudeJson({
      system,
      messages: [{ role: 'user', content: userMessage }],
      schema: routingSchema,
      mockFn: () => mockClassify(extracted, departments, searchText),
    });

    const validIds = new Set(departments.map((d) => d._id.toString()));
    if (!validIds.has(result.primary)) return null;
    result.secondary = (result.secondary || []).filter((id) => validIds.has(id) && id !== result.primary);

    return result;
  } catch (e) {
    return null;
  }
};

/**
 * Route a complaint to the appropriate department(s).
 */
export async function routeComplaint(extracted, location = null) {
  const normLocation = normalizeLocation(location);
  const departments = await Department.find({}).select('_id nameEn nameBn email responsibilities keywords jurisdictionType slaHours').lean();
  const jurisdictions = await Jurisdiction.find({}).select('_id department areaName wards verified').populate('department', '_id nameEn nameBn email responsibilities keywords jurisdictionType slaHours').lean();

  const searchText = buildSearchText(extracted);
  const deptMap = new Map(departments.map((d) => [d._id.toString(), d]));

  let primaryId = null;
  let secondaryIds = [];
  let confidence = 0;
  let reasoning = '';
  let method = 'rule';

  // Step 1: Rule layer - keyword matching with category boost
  const scores = departments.map((d) => ({
    dept: d,
    score: scoreDepartment(d, searchText, extracted.category),
  }));
  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0]?.score || 0;
  const hasMatches = topScore > 0;
  const topDepts = hasMatches ? scores.filter((s) => s.score === topScore) : [];

  if (hasMatches && topDepts.length === 1) {
    const matched = topDepts[0].dept;
    if (isJurisdictionType(matched.jurisdictionType)) {
      const resolved = resolveJurisdiction(
        [matched.jurisdictionType.includes('D') && matched.jurisdictionType.length === 4 ? matched.jurisdictionType : matched.jurisdictionType],
        departments,
        jurisdictions,
        extracted,
        normLocation
      );
      // Determine candidate types based on matched type
      const candTypes = matched.jurisdictionType === 'DNCC' || matched.jurisdictionType === 'DSCC'
        ? ['DNCC', 'DSCC']
        : ['DPDC', 'DESCO'];
      const resolved2 = resolveJurisdiction(candTypes, departments, jurisdictions, extracted, normLocation);
      if (resolved2) {
        primaryId = resolved2;
        confidence = 0.9;
        const resolvedDept = deptMap.get(resolved2);
        reasoning = `Rule: ${matched.nameEn} keywords matched, jurisdiction resolved to ${resolvedDept?.nameEn || resolved2}`;
      } else {
        primaryId = matched._id.toString();
        confidence = 0.5;
        reasoning = `Rule: ${matched.nameEn} keywords matched, but area unknown - could not resolve jurisdiction`;
      }
    } else {
      primaryId = matched._id.toString();
      confidence = 0.9;
      reasoning = `Rule: ${matched.nameEn} matched (score ${topScore})`;
    }
    method = 'rule';
  } else if (hasMatches && topDepts.length > 1) {
    const types = new Set(topDepts.map((t) => t.dept.jurisdictionType));
    if (types.size === 1 && isJurisdictionType([...types][0])) {
      const candTypes = [...types][0] === 'DNCC' || [...types][0] === 'DSCC'
        ? ['DNCC', 'DSCC']
        : ['DPDC', 'DESCO'];
      const resolved = resolveJurisdiction(candTypes, departments, jurisdictions, extracted, normLocation);
      if (resolved) {
        primaryId = resolved;
        confidence = 0.85;
        const resolvedDept = deptMap.get(resolved);
        reasoning = `Jurisdiction resolved ${[...types][0]} to ${resolvedDept?.nameEn || resolved}`;
      } else {
        confidence = 0.5;
        reasoning = `Ambiguous: multiple ${[...types][0]} candidates, area unknown`;
      }
      method = 'rule';
    } else {
      method = 'llm';
    }
  } else {
    method = 'llm';
  }

  // LLM classifier
  if (method === 'llm') {
    const llmResult = await callLLMClassifier(extracted, departments, searchText);
    if (llmResult && llmResult.primary) {
      primaryId = llmResult.primary;
      secondaryIds = llmResult.secondary || [];
      confidence = llmResult.confidence;
      reasoning = llmResult.reasoning;

      // Resolve jurisdiction if primary is a jurisdiction-dependent dept
      const primaryDept = deptMap.get(primaryId);
      if (primaryDept && isJurisdictionType(primaryDept.jurisdictionType)) {
        const candTypes = primaryDept.jurisdictionType === 'DNCC' || primaryDept.jurisdictionType === 'DSCC'
          ? ['DNCC', 'DSCC']
          : ['DPDC', 'DESCO'];
        const resolved = resolveJurisdiction(candTypes, departments, jurisdictions, extracted, normLocation);
        if (resolved && resolved !== primaryId) {
          // Replace with resolved jurisdiction
          // But only if the LLM returned a generic type; if LLM returned specific (DNCC/DSCC), keep it
          // Actually, LLM returns specific dept IDs, so if it returned DNCC but jurisdiction says DSCC, override
          const resolvedDept = deptMap.get(resolved);
          if (resolvedDept) {
            primaryId = resolved;
            reasoning += ` | Jurisdiction resolved to ${resolvedDept.nameEn}`;
          }
        }
      }
    } else {
      confidence = 0.3;
      reasoning = 'LLM classification failed or returned invalid department';
    }
  }

  // Step 4: Multi-department rules
  // Waterlogging -> WASA primary, city corp secondary
  if (extracted.category === 'waterlogging') {
    const wasaDept = departments.find((d) => d.jurisdictionType === 'WASA');
    if (wasaDept) {
      const wasaId = wasaDept._id.toString();
      // Resolve city corp from area for secondary
      const cityCorpId = resolveJurisdiction(['DNCC', 'DSCC'], departments, jurisdictions, extracted, normLocation);
      if (cityCorpId && cityCorpId !== wasaId && !secondaryIds.includes(cityCorpId)) {
        secondaryIds.push(cityCorpId);
      }
      if (primaryId && primaryId !== wasaId) {
        if (!secondaryIds.includes(primaryId)) secondaryIds.push(primaryId);
        primaryId = wasaId;
      } else if (!primaryId) {
        primaryId = wasaId;
      }
      if (!reasoning.includes('Multi-dept')) {
        reasoning += ' | Multi-dept: waterlogging → WASA primary + city corp secondary';
      }
    }
  }

  // Validate IDs
  if (primaryId && !deptMap.has(primaryId)) {
    primaryId = null;
    confidence = 0.2;
    reasoning = 'Invalid department ID returned';
  }
  secondaryIds = [...new Set(secondaryIds.filter((id) => deptMap.has(id) && id !== primaryId))];

  // Step 5: Triage
  let needsTriage = false;
  if (extracted.isSpam) {
    needsTriage = true;
    method = 'triage';
    confidence = Math.min(confidence, 0.3);
    reasoning += ' | Spam detected → triage';
  }
  if (confidence < 0.7) {
    needsTriage = true;
    if (method !== 'triage') method = 'triage';
  }
  if (!primaryId) {
    needsTriage = true;
    method = 'triage';
    confidence = 0.2;
    reasoning = 'Could not determine department → triage';
  }

  // If needsTriage, set method to triage
  if (needsTriage) {
    method = 'triage';
  }

  return {
    primaryDepartmentId: primaryId,
    secondaryDepartmentIds: secondaryIds,
    confidence: Math.round(confidence * 100) / 100,
    method,
    reasoning,
    needsTriage,
  };
}

/**
 * Pick the best department for one problem segment of a complaint.
 * Uses the same rule layer as routeComplaint (keyword score + jurisdiction).
 *
 * @param {string} text - Problem segment text.
 * @param {string} category - Detected category for the segment.
 * @param {Object} [context]
 * @param {Array} [context.departments]
 * @param {Array} [context.jurisdictions]
 * @param {Object} [context.extracted]
 * @param {Object} [context.location]
 * @returns {Promise<{departmentId: string|null, jurisdictionType: string, nameEn: string, confidence: number, reason: string}>}
 */
export async function pickDepartmentForProblem(text, category, context = {}) {
  const departments = context.departments || await Department.find({})
    .select('_id nameEn nameBn email responsibilities keywords jurisdictionType slaHours').lean();
  const jurisdictions = context.jurisdictions || await Jurisdiction.find({})
    .select('_id department areaName wards verified').populate('department', '_id nameEn nameBn jurisdictionType').lean();

  const searchText = String(text || '').toLowerCase();
  const deptMap = new Map(departments.map((d) => [d._id.toString(), d]));
  const ranked = departments
    .map((d) => ({ dept: d, score: scoreDepartment(d, searchText, category) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score <= 0) {
    return { departmentId: null, jurisdictionType: '', nameEn: '', confidence: 0, reason: 'No keyword match for this problem' };
  }

  let departmentId = best.dept._id.toString();
  let confidence = 0.9;
  let reason = `Rule: ${best.dept.nameEn} matched (score ${best.score})`;

  if (isJurisdictionType(best.dept.jurisdictionType)) {
    const candTypes = ['DNCC', 'DSCC'].includes(best.dept.jurisdictionType)
      ? ['DNCC', 'DSCC']
      : ['DPDC', 'DESCO'];
    const resolved = resolveJurisdiction(candTypes, departments, jurisdictions, context.extracted || {}, context.location || null);
    if (resolved && deptMap.has(resolved)) {
      departmentId = resolved;
      confidence = 0.92;
      reason = `Jurisdiction resolved to ${deptMap.get(resolved).nameEn}`;
    } else {
      confidence = 0.55;
      reason = `${best.dept.nameEn} matched but area could not be resolved`;
    }
  }

  const dept = deptMap.get(departmentId) || best.dept;
  return {
    departmentId,
    jurisdictionType: dept.jurisdictionType,
    nameEn: dept.nameEn,
    nameBn: dept.nameBn,
    confidence,
    reason,
  };
}
