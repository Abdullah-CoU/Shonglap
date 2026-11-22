import ffmpeg from 'fluent-ffmpeg';
import { unlink, stat, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// Check if ffmpeg is available
let ffmpegAvailable = true;
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
} catch {
  ffmpegAvailable = false;
  logger.warn('ffmpeg not found; audio conversion will be skipped');
}

const MAX_DURATION_SEC = 120; // 2 minutes
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Convert any audio file to 16 kHz mono WAV using fluent-ffmpeg.
 *
 * @param {string} inputPath - Path to the input audio file.
 * @returns {Promise<string>} - Path to the converted WAV file.
 * @throws {Error} if file exceeds size/duration limits.
 */
export async function convertToWav(inputPath) {
  // Check file size
  const stats = await stat(inputPath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`File size ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds limit of 10MB`);
  }

  // If ffmpeg is not available, return input as-is (assume compatible format)
  if (!ffmpegAvailable) {
    logger.warn('ffmpeg not available, skipping conversion');
    return inputPath;
  }

  const outputPath = join(tmpdir(), `shonglap_${randomUUID()}.wav`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .on('end', async () => {
        try {
          const outStats = await stat(outputPath);
          const estimatedDuration = outStats.size / 32000;
          if (estimatedDuration > MAX_DURATION_SEC) {
            await unlink(outputPath).catch(() => {});
            reject(new Error(`Audio duration ~${Math.round(estimatedDuration)}s exceeds limit of ${MAX_DURATION_SEC}s`));
            return;
          }
          resolve(outputPath);
        } catch (e) {
          reject(e);
        }
      })
      .on('error', (err) => {
        reject(new Error(`ffmpeg conversion failed: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Delete a temp file safely.
 * @param {string} filePath
 */
export async function deleteTempFile(filePath) {
  try {
    await unlink(filePath);
  } catch (e) {
    logger.warn({ err: e.message, filePath }, 'Failed to delete temp file');
  }
}

/**
 * Clean up multiple temp files.
 * @param {string[]} filePaths
 */
export async function cleanupTempFiles(filePaths) {
  await Promise.allSettled(filePaths.map(deleteTempFile));
}
