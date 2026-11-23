import { z } from 'zod';

/**
 * Minimal structured problem report. `area` is the only mandatory field.
 */
export const problemReportSchema = z.object({
  trackingId: z.string(),
  category: z.string(),
  description: z.string(),
  area: z.string().min(1, 'Area is required'),
  ward: z.number().nullable().optional(),
  urgency: z.string(),
  status: z.string(),
  department: z.string(),
  createdAt: z.string(),
});

/**
 * Build a minimal JSON problem report from a complaint.
 * Throws ZodError if mandatory field `area` is missing.
 */
export function buildProblemReport(complaint) {
  const primary = complaint.routing?.find((r) => r.isPrimary);
  const deptName =
    primary?.department?.nameEn ||
    primary?.department?.nameBn ||
    'Unassigned (triage)';

  return problemReportSchema.parse({
    trackingId: complaint.trackingId,
    category: complaint.category,
    description: complaint.description,
    area: complaint.area || '',
    ward: complaint.ward ?? null,
    urgency: complaint.urgency,
    status: complaint.status,
    department: deptName,
    createdAt: new Date(complaint.createdAt).toISOString(),
  });
}

/**
 * Build a minimal formal report (plain text letter) from the JSON report.
 */
export function buildFormalReport(r) {
  return [
    'TO THE AUTHORITY CONCERNED',
    `Ref: ${r.trackingId} | ${new Date(r.createdAt).toLocaleDateString('en-GB')}`,
    '',
    `Subject: ${r.category} complaint in ${r.area}${r.ward ? ` (Ward ${r.ward})` : ''}`,
    '',
    r.description,
    '',
    `Urgency: ${r.urgency}    Status: ${r.status}`,
    `Department: ${r.department}`,
    '',
    'Sincerely,',
    'Citizen (via Shonglap)',
  ].join('\n');
}

/**
 * Generate both the JSON and formal report. If `area` is missing, returns
 * `missing: ['area']` so the caller can ask the user.
 */
export function generateReport(complaint) {
  if (!complaint.area) {
    return { ok: false, missing: ['area'], json: null, formal: null };
  }
  const json = buildProblemReport(complaint);
  return { ok: true, missing: [], json, formal: buildFormalReport(json) };
}
