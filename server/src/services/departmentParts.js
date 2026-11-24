/**
 * Build the per-department "part" of a complaint. Each office sees only the
 * slice of the report that concerns it, with its own status and status log.
 */

const ASPECTS = {
  WASA: { en: 'Water supply & drainage', bn: 'পানি সরবরাহ ও নিকাশি' },
  DNCC: { en: 'Roads, waste & local infrastructure', bn: 'রাস্তা, বর্জ্য ও স্থানীয় অবকাঠামো' },
  DSCC: { en: 'Roads, waste & local infrastructure', bn: 'রাস্তা, বর্জ্য ও স্থানীয় অবকাঠামো' },
  DPDC: { en: 'Electricity distribution', bn: 'বিদ্যুৎ বিতরণ' },
  DESCO: { en: 'Electricity distribution', bn: 'বিদ্যুৎ বিতরণ' },
  Titas: { en: 'Gas supply', bn: 'গ্যাস সরবরাহ' },
  Traffic: { en: 'Traffic management', bn: 'ট্রাফিক ব্যবস্থাপনা' },
  Police: { en: 'Law & order', bn: 'আইন ও শৃঙ্খলা' },
  RAJUK: { en: 'Planning & construction', bn: 'পরিকল্পনা ও নির্মাণ' },
  Fire: { en: 'Fire safety', bn: 'অগ্নি নিরাপত্তা' },
  DOE: { en: 'Environment & pollution', bn: 'পরিবেশ ও দূষণ' },
  RHD: { en: 'Roads & highways', bn: 'রাস্তা ও মহাসড়ক' },
};

const ASPECT_KEYWORDS = {
  WASA: ['water', 'drain', 'sewer', 'waterlogging', 'pani', 'পানি', 'নিকাশি', 'ড্রেন', 'প্লাবন'],
  DNCC: ['road', 'pothole', 'garbage', 'waste', 'streetlight', 'mosquito', 'রাস্তা', 'গর্ত', 'ময়লা', 'আবর্জনা', 'স্ট্রিটলাইট', 'মশা'],
  DSCC: ['road', 'pothole', 'garbage', 'waste', 'streetlight', 'mosquito', 'রাস্তা', 'গর্ত', 'ময়লা', 'আবর্জনা', 'স্ট্রিটলাইট', 'মশা'],
  DPDC: ['electric', 'power', 'wire', 'streetlight', 'বিদ্যুৎ', 'তার', 'লোডশেডিং'],
  DESCO: ['electric', 'power', 'wire', 'streetlight', 'বিদ্যুৎ', 'তার', 'লোডশেডিং'],
  Titas: ['gas', 'গ্যাস'],
  Traffic: ['traffic', 'signal', 'congestion', 'ট্রাফিক', 'সিগন্যাল'],
  Police: ['police', 'crime', 'theft', 'পুলিশ', 'অপরাধ', 'চুরি'],
  RAJUK: ['construction', 'building', 'illegal', 'নির্মাণ', 'বিল্ডিং'],
  Fire: ['fire', 'অগ্নিকাণ্ড', 'আগুন'],
  DOE: ['pollution', 'noise', 'দূষণ', 'শব্দ'],
  RHD: ['highway', 'national road', 'flyover', 'মহাসড়ক', 'ফ্লাইওভার'],
};

const DEFAULT_ASPECT = { en: 'Assigned responsibility', bn: 'অর্পিত দায়িত্ব' };

/** Split text into sentences (supports Bangla danda and Latin punctuation). */
function splitSentences(text = '') {
  return text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pick only the sentences relevant to a department; fall back to the whole text. */
function scopeDescription(description = '', jurisdictionType = '') {
  const sentences = splitSentences(description);
  if (sentences.length < 2) return description;
  const keywords = ASPECT_KEYWORDS[jurisdictionType] || [];
  const matched = sentences.filter((s) => {
    const lower = s.toLowerCase();
    return keywords.some((kw) => lower.includes(kw.toLowerCase()));
  });
  return matched.length ? matched.join(' ') : description;
}

/**
 * @param {Object} params
 * @param {Object} params.routing - RoutingDecision from routeComplaint().
 * @param {Object} params.extracted - Extracted complaint data.
 * @param {Object} params.departmentsById - Map of id -> department doc (with jurisdictionType).
 * @param {string} [params.citizenDepartmentId] - Secondary office chosen by the citizen.
 * @param {string} [params.citizenNote] - Citizen's description of that office's part.
 * @param {string} [params.status] - Initial status for each part.
 * @returns {Array} departmentParts
 */
export function buildDepartmentParts({
  routing,
  extracted,
  departmentsById = {},
  citizenDepartmentId = '',
  citizenNote = '',
  status = 'assigned',
}) {
  const ids = [];
  if (routing.primaryDepartmentId) ids.push({ id: routing.primaryDepartmentId, role: 'primary' });
  for (const id of routing.secondaryDepartmentIds || []) {
    ids.push({ id, role: 'secondary' });
  }

  return ids.map(({ id, role }) => {
    const dept = departmentsById[id] || {};
    const type = dept.jurisdictionType || '';
    const aspect = ASPECTS[type] || DEFAULT_ASPECT;
    const isCitizenPart = citizenDepartmentId && String(citizenDepartmentId) === String(id);
    const description = isCitizenPart && citizenNote
      ? citizenNote
      : scopeDescription(extracted.description || '', type);

    const reason = isCitizenPart && citizenNote
      ? 'Citizen indicated this office is also involved'
      : role === 'primary'
        ? (routing.reasoning || 'Primary office for this complaint')
        : 'Shared complaint: secondary office';

    return {
      department: id,
      role,
      aspect: `${aspect.en} / ${aspect.bn}`,
      description,
      reason,
      status,
      statusLog: [{ status, note: 'Assigned to office', actor: 'system', at: new Date() }],
    };
  });
}

/**
 * Synthesize a part for legacy complaints without stored departmentParts.
 * @param {Object} complaint - Lean complaint with routing populated.
 * @param {string} departmentId - Current office id.
 */
export function partForDepartment(complaint, departmentId) {
  const stored = (complaint.departmentParts || []).find(
    (p) => p.department?._id?.toString() === String(departmentId) || p.department?.toString() === String(departmentId)
  );
  if (stored) return stored;

  const routingEntry = (complaint.routing || []).find(
    (r) => r.department?._id?.toString() === String(departmentId) || r.department?.toString() === String(departmentId)
  );
  return {
    department: departmentId,
    role: routingEntry?.isPrimary ? 'primary' : 'secondary',
    aspect: '',
    description: complaint.description || '',
    reason: routingEntry?.reason || '',
    status: complaint.status || 'received',
    statusLog: complaint.statusLog || [],
  };
}
