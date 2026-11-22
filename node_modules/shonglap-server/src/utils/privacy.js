import sharp from 'sharp';
import { logger } from './logger.js';

/**
 * Apply a privacy blur to an image (face/plate region).
 * Uses a simple approach: applies Gaussian blur to the entire image.
 * In production, this would use face/plate detection to blur only regions.
 *
 * @param {string} inputPath - Path to the input image.
 * @param {string} outputPath - Path to save the blurred image.
 * @param {Object} [options]
 * @param {number} [options.sigma=5] - Blur sigma.
 * @returns {Promise<string>} - Path to the blurred image.
 */
export async function applyPrivacyBlur(inputPath, outputPath, { sigma = 5 } = {}) {
  try {
    await sharp(inputPath)
      .blur(sigma)
      .toFile(outputPath);
    logger.info({ inputPath, outputPath }, 'Privacy blur applied');
    return outputPath;
  } catch (err) {
    logger.error({ err: err.message }, 'Privacy blur failed');
    throw err;
  }
}

/**
 * Check if privacy blur is enabled via env.
 * @returns {boolean}
 */
export function isPrivacyBlurEnabled() {
  return process.env.PRIVACY_BLUR === 'true';
}
