import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Lightweight routing self-verification agent.
 * After segmentation, each part is checked against category expectations,
 * the area's jurisdiction mapping, and its confidence. Problems are flagged
 * for human review instead of silently changing the routing decision.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const JURISDICTIONS = JSON.parse(readFileSync(
  join(__dirname, '..', '..', '..', 'data', 'jurisdictions.json'), 'utf-8'
));

const CATEGORY_TYPES = {
  road: ['DNCC', 'DSCC', 'RHD'],
  garbage: ['DNCC', 'DSCC'],
  mosquito: ['DNCC', 'DSCC'],
  streetlight: ['DNCC', 'DSCC', 'DPDC', 'DESCO'],
  water: ['WASA'],
  sewerage: ['WASA'],
  waterlogging: ['WASA', 'DNCC', 'DSCC'],
  electricity: ['DPDC', 'DESCO'],
  gas: ['Titas'],
  construction: ['RAJUK'],
  crime: ['Police'],
  traffic: ['Traffic'],
  fire: ['Fire'],
  pollution: ['DOE'],
  noise: ['DOE'],
};

// Cross-cutting services are valid in any area.
const AREA_AGNOSTIC = new Set(['WASA', 'Titas', 'DPDC', 'DESCO', 'Fire', 'Police', 'Traffic', 'RAJUK', 'DOE', 'RHD']);

/**
 * @param {Object} params
 * @param {Array} params.parts - Segmented problem parts.
 * @param {string} params.area - Resolved complaint area.
 * @param {Object} [params.departmentsById] - id -> department info (jurisdictionType).
 */
export function verifyRouting({ parts = [], area = '', departmentsById = {} } = {}) {
  const areaEntry = JURISDICTIONS.find(
    (j) => j.areaName?.toLowerCase() === String(area || '').toLowerCase()
  );
  const areaTypes = areaEntry
    ? [areaEntry.cityCorp, areaEntry.powerZone].filter(Boolean)
    : [];

  const checks = parts.map((part, index) => {
    const type = departmentsById[String(part.departmentId)]?.jurisdictionType || part.jurisdictionType || '';
    const expected = CATEGORY_TYPES[part.category] || [];
    const categoryOk = expected.length === 0 || expected.includes(type);
    const areaOk = areaTypes.length === 0 || areaTypes.includes(type) || AREA_AGNOSTIC.has(type);
    const confidenceOk = (part.confidence ?? 0.8) >= 0.7;

    const reasons = [];
    if (!categoryOk) reasons.push(`${type || 'unknown office'} is not typical for ${part.category}`);
    if (!areaOk) reasons.push(`office does not match ${area} jurisdiction (${areaTypes.join('/')})`);
    if (!confidenceOk) reasons.push('routing confidence below 0.7');

    return {
      index: index + 1,
      category: part.category,
      departmentId: part.departmentId,
      jurisdictionType: type,
      confidence: part.confidence ?? 0.8,
      status: reasons.length ? 'review' : 'verified',
      reason: reasons.length ? reasons.join('; ') : 'Category, jurisdiction and confidence checks passed',
    };
  });

  const verified = checks.every((c) => c.status === 'verified');
  const confidence = checks.length
    ? checks.reduce((sum, c) => sum + c.confidence, 0) / checks.length
    : 0;

  logger.info({ verified, area, checks: checks.length, confidence: Math.round(confidence * 100) / 100 }, 'Routing self-verification complete');

  return { verified, checks, confidence: Math.round(confidence * 100) / 100 };
}
