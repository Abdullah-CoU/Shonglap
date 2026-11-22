import { readFile } from 'fs/promises';
import { basename } from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Transcribe audio by POSTing to a Whisper sidecar service.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {Object} [options]
 * @param {string} [options.language='bn'] - Language code.
 * @returns {Promise<{text: string, language: string, duration: number, segments: Array}>}
 */
export async function transcribe(filePath, { language = 'bn' } = {}) {
  const sidecarUrl = env.WHISPER_SIDECAR_URL;
  const fileBuffer = await readFile(filePath);
  const fileName = basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer]), fileName);
  formData.append('language', language);

  const response = await fetch(`${sidecarUrl}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sidecar transcription failed: ${response.status} ${errText}`);
  }

  const data = await response.json();

  return {
    text: data.text || '',
    language: data.language || language,
    duration: data.duration || 0,
    segments: data.segments || [],
  };
}
