/**
 * Per-department "parts" of a complaint. Parts are produced automatically by
 * segmenting the citizen's text; each office sees only the slice that concerns
 * it, with its own status and status log.
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

const DEFAULT_ASPECT = { en: 'Assigned responsibility', bn: 'অর্পিত দায়িত্ব' };

export function aspectLabel(jurisdictionType, nameEn = '', nameBn = '') {
  const aspect = ASPECTS[jurisdictionType] || DEFAULT_ASPECT;
  return `${aspect.en} / ${aspect.bn}${nameEn ? ` — ${nameBn || nameEn}` : ''}`;
}

/**
 * Convert routed problem segments into stored department parts.
 *
 * @param {Object} params
 * @param {Array} params.parts - Segments from segmentComplaint().
 * @param {Object} [params.departmentsById] - id -> department doc.
 * @param {string} [params.status] - Initial status for each part.
 * @returns {Array}
 */
export function buildDepartmentParts({ parts = [], departmentsById = {}, status = 'assigned' }) {
  return parts
    .filter((part) => part.departmentId)
    .map((part, index) => {
      const dept = departmentsById[String(part.departmentId)] || {};
      return {
        department: part.departmentId,
        role: index === 0 ? 'primary' : 'secondary',
        aspect: aspectLabel(dept.jurisdictionType, dept.nameEn, dept.nameBn),
        category: part.category || '',
        description: part.description || '',
        urgency: part.urgency || 'medium',
        reason: part.reason || 'Automatically detected from complaint text',
        status,
        statusLog: [{ status, note: 'Assigned from complaint text', actor: 'system', at: new Date() }],
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
