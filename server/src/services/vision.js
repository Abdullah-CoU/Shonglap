import { z } from 'zod';
import sharp from 'sharp';
import exifr from 'exifr';
import { readFile, stat, mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { callClaudeJson } from './llm.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

const CATEGORIES = [
  'road', 'garbage', 'mosquito', 'streetlight', 'water', 'sewerage',
  'waterlogging', 'electricity', 'gas', 'construction', 'crime', 'traffic',
  'fire', 'pollution', 'noise', 'spam',
];

const visionSchema = z.object({
  description: z.string().default(''),
  detectedIssue: z.string().default(''),
  suggestedCategory: z.enum(CATEGORIES).default('spam'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  isRelevant: z.boolean().default(true),
  qualityWarning: z.string().default(''),
});

const SYSTEM_PROMPT = `You are a civic complaint image analyzer for Dhaka, Bangladesh.
Analyze the provided image and return ONLY a valid JSON object. No markdown, no explanation.

Determine:
- description: A brief English description of what the image shows.
- detectedIssue: The civic issue visible in the image (e.g., "pothole", "garbage pile", "broken streetlight").
- suggestedCategory: One of: ${CATEGORIES.join(', ')}.
- severity: One of: low, medium, high, critical.
- isRelevant: true if the image shows a civic issue relevant to Dhaka municipal services. false if it's a selfie, meme, screenshot, inappropriate content, or unrelated.
- qualityWarning: Any quality issue (e.g., "blurry", "too dark", "low resolution") or empty string.

Return JSON with these exact fields:
{
  "description": "...",
  "detectedIssue": "...",
  "suggestedCategory": "...",
  "severity": "...",
  "isRelevant": true/false,
  "qualityWarning": "..."
}`;

const MOCK_VISION_RESULT = {
  description: 'A pothole on a road in Dhaka.',
  detectedIssue: 'pothole',
  suggestedCategory: 'road',
  severity: 'medium',
  isRelevant: true,
  qualityWarning: '',
};

/**
 * Detect category from text using keyword matching.
 * @param {string} text
 * @returns {string}
 */
const detectTextCategory = (text) => {
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower.includes('gas') || lower.includes('গ্যাস')) return 'gas';
  if (lower.includes('electricity') || lower.includes('power') || lower.includes('বিদ্যুৎ') || lower.includes('bijli')) return 'electricity';
  if (lower.includes('waterlogging') || lower.includes('waterlog')) return 'waterlogging';
  if (lower.includes('pollution') || lower.includes('factory')) return 'pollution';
  if (lower.includes('noise') || lower.includes('sound') || lower.includes('loud')) return 'noise';
  if (lower.includes('mosquito') || lower.includes('dengue') || lower.includes('মশা')) return 'mosquito';
  if (lower.includes('garbage') || lower.includes('waste') || lower.includes('trash') || lower.includes('ময়লা')) return 'garbage';
  if (lower.includes('fire') || lower.includes('আগুন')) return 'fire';
  if (lower.includes('streetlight') || lower.includes('lamp') || lower.includes('বাতি')) return 'streetlight';
  if (lower.includes('building') || lower.includes('construction') || lower.includes('illegal') || lower.includes('নির্মাণ')) return 'construction';
  if (lower.includes('traffic') || lower.includes('jam') || lower.includes('signal') || lower.includes('parking')) return 'traffic';
  if (lower.includes('pothole') || lower.includes('road') || lower.includes('রাস্তা')) return 'road';
  if (lower.includes('water') || lower.includes('পানি') || lower.includes('wasa')) return 'water';
  if (lower.includes('sewerage') || lower.includes('overflow')) return 'sewerage';
  return '';
};

/**
 * Save original file under /uploads with a random UUID filename.
 *
 * @param {string} sourcePath - Path to the source file.
 * @param {string} originalName - Original filename (for extension).
 * @returns {Promise<string>} - Path to the saved file.
 */
export async function saveOriginal(sourcePath, originalName) {
  const uploadsDir = join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });

  const ext = extname(originalName).toLowerCase() || '.jpg';
  const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : '.jpg';
  const filename = `${randomUUID()}${safeExt}`;
  const destPath = join(uploadsDir, filename);

  const buffer = await readFile(sourcePath);
  await writeFile(destPath, buffer);

  return destPath;
}

/**
 * Analyze a photo for civic issues using Claude vision.
 *
 * @param {string} filePath - Path to the image file.
 * @param {Object} [options]
 * @param {string} [options.text] - Optional complaint text for conflict check.
 * @returns {Promise<Object>} - Analysis result with conflict flag.
 */
export async function analyzePhoto(filePath, { text = '' } = {}) {
  // Validate file size
  const stats = await stat(filePath);
  if (stats.size > MAX_SIZE) {
    throw new Error(`File size ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds limit of 8MB`);
  }

  // Validate file type
  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  // Read EXIF GPS
  let exifLat = null;
  let exifLng = null;
  try {
    const gps = await exifr.gps(filePath);
    if (gps) {
      exifLat = gps.latitude ?? null;
      exifLng = gps.longitude ?? null;
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'Failed to read EXIF GPS');
  }

  // Resize with sharp
  let imageBuffer;
  let mediaType = 'image/jpeg';
  try {
    imageBuffer = await sharp(filePath)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    mediaType = 'image/jpeg';
  } catch (e) {
    throw new Error(`Image processing failed: ${e.message}`);
  }

  const base64Image = imageBuffer.toString('base64');

  // MOCK_LLM mode
  if (env.MOCK_LLM) {
    const result = { ...MOCK_VISION_RESULT, exifLat, exifLng };

    // Conflict check
    if (text) {
      const textCategory = detectTextCategory(text);
      if (textCategory && textCategory !== result.suggestedCategory) {
        result.conflict = true;
      } else {
        result.conflict = false;
      }
    } else {
      result.conflict = false;
    }

    return result;
  }

  // Real Claude vision call
  const client = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new client({ apiKey: env.ANTHROPIC_API_KEY });

  const mockFn = () => MOCK_VISION_RESULT;

  let visionResult;
  try {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: 'Analyze this image for civic issues.',
            },
          ],
        },
      ],
    });

    const textBlock = response.content?.find((b) => b.type === 'text');
    const rawText = textBlock?.text ?? '';
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    const parsed = JSON.parse(cleaned);
    visionResult = visionSchema.parse(parsed);
  } catch (e) {
    logger.error({ err: e.message }, 'Vision analysis failed');
    throw new Error(`Vision analysis failed: ${e.message}`);
  }

  const result = {
    ...visionResult,
    exifLat,
    exifLng,
  };

  // Conflict check
  if (text) {
    const textCategory = detectTextCategory(text);
    if (textCategory && textCategory !== result.suggestedCategory) {
      result.conflict = true;
    } else {
      result.conflict = false;
    }
  } else {
    result.conflict = false;
  }

  return result;
}
