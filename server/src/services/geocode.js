import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Curated landmark gazetteer resolver.
 * Turns a landmark / bus stop / shop name mentioned in a complaint into a
 * Dhaka area, ward and coordinates, so jurisdiction routing can work even
 * when the citizen never says the area name.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANDMARKS_PATH = join(__dirname, '..', '..', '..', 'data', 'landmarks.json');

let LANDMARKS = [];
try {
  LANDMARKS = JSON.parse(readFileSync(LANDMARKS_PATH, 'utf-8'));
} catch (err) {
  logger.warn({ err: err.message }, 'Could not load landmark gazetteer');
}

const normalize = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const tokens = (value) => normalize(value).split(' ').filter((t) => t.length >= 2);

/** Edit distance, capped for speed. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/** Score one alias against the normalized complaint text. */
function scoreAlias(alias, text, textTokens) {
  const normalizedAlias = normalize(alias);
  if (!normalizedAlias) return 0;

  // Exact phrase (handles multi-word bus stops and shops).
  if (text.includes(normalizedAlias)) {
    return Math.min(0.96, 0.86 + 0.03 * tokens(alias).length);
  }

  const aliasTokens = tokens(alias);
  if (!aliasTokens.length) return 0;

  const exact = aliasTokens.filter((t) => textTokens.includes(t)).length;
  const fuzzy = aliasTokens.filter((t) =>
    !textTokens.includes(t) && t.length >= 4 && textTokens.some((w) => {
      const maxDistance = t.length >= 6 ? 2 : 1;
      return Math.abs(w.length - t.length) <= maxDistance && editDistance(w, t) <= maxDistance;
    })
  ).length;

  if (exact === aliasTokens.length) return 0.86;
  if (exact + fuzzy === aliasTokens.length) return 0.68;
  if (exact >= Math.ceil(aliasTokens.length / 2)) return 0.58;
  return 0;
}

/**
 * Find the best landmark mentioned in free text.
 * @param {string} text
 * @returns {{landmark:string, area:string, ward:number|null, lat:number, lng:number, type:string, confidence:number, matchedAlias:string}|null}
 */
export function resolveLandmark(text = '') {
  const normalizedText = normalize(text);
  if (!normalizedText) return null;
  const textTokens = tokens(text);

  let best = null;
  for (const landmark of LANDMARKS) {
    let landmarkScore = 0;
    let matchedAlias = '';
    for (const alias of landmark.aliases || []) {
      const score = scoreAlias(alias, normalizedText, textTokens);
      if (score > landmarkScore) {
        landmarkScore = score;
        matchedAlias = alias;
      }
    }
    if (landmarkScore >= 0.58 && (!best || landmarkScore > best.score)) {
      best = {
        score: landmarkScore,
        landmark: landmark.name,
        area: landmark.area,
        ward: landmark.ward ?? null,
        lat: landmark.lat,
        lng: landmark.lng,
        type: landmark.type,
        matchedAlias,
      };
    }
  }

  if (!best) return null;
  const { score, ...result } = best;
  return { ...result, confidence: score };
}

/**
 * Enrich extracted complaint data with a landmark-derived area.
 * Never overrides an explicitly detected area, but still records the landmark.
 *
 * @param {Object} extracted - Extracted complaint.
 * @param {Object} [inputs] - Raw draft inputs.
 * @returns {{extracted: Object, location: Object|null, matched: Object|null}}
 */
export function resolveComplaintLocation(extracted = {}, inputs = {}) {
  const text = [
    inputs.text,
    inputs.transcript,
    extracted.description,
    extracted.descriptionBn,
    extracted.landmark,
  ].filter(Boolean).join(' ');

  const matched = resolveLandmark(text);

  if (extracted.area) {
    return {
      extracted: {
        ...extracted,
        landmark: extracted.landmark || matched?.landmark || '',
        locationSource: 'area',
        locationConfidence: 0.9,
        matchedLandmark: matched?.landmark || '',
        missingFields: (extracted.missingFields || []).filter((f) => f !== 'area'),
      },
      location: null,
      matched,
    };
  }

  if (matched) {
    return {
      extracted: {
        ...extracted,
        area: matched.area,
        ward: extracted.ward ?? matched.ward,
        landmark: matched.landmark,
        locationSource: 'landmark',
        locationConfidence: matched.confidence,
        matchedLandmark: matched.landmark,
        missingFields: (extracted.missingFields || []).filter((f) => f !== 'area'),
      },
      location: { lat: matched.lat, lng: matched.lng },
      matched,
    };
  }

  return {
    extracted: {
      ...extracted,
      locationSource: extracted.area ? 'area' : 'unknown',
      locationConfidence: extracted.area ? 0.9 : 0,
      matchedLandmark: '',
    },
    location: null,
    matched: null,
  };
}
