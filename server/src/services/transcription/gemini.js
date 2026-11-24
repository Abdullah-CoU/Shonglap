import { readFile } from 'fs/promises';
import { basename } from 'path';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const TIMEOUT_MS = 45_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferMime(filePath) {
  const name = basename(filePath).toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/webm';
}

/**
 * Transcribe audio using Google Gemini's multimodal API.
 * Includes timeout and retry for transient failures.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {Object} [options]
 * @param {string} [options.language='bn'] - Language code.
 * @returns {Promise<{text: string, language: string, duration: number, segments: Array}>}
 */
export async function transcribe(filePath, { language = 'bn' } = {}) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not configured');
  }

  const model = env.GEMINI_MODEL;
  const buffer = await readFile(filePath);
  const base64 = buffer.toString('base64');
  const mimeType = inferMime(filePath);
  const languageName = language === 'bn' ? 'Bangla (বাংলা)' : language === 'en' ? 'English' : language;

  const prompt = `Transcribe this audio recording exactly as spoken in ${languageName}.
This is a civic complaint in Dhaka, Bangladesh. Common areas: Gulshan, Banani, Dhanmondi, Uttara, Mirpur, Motijheel, Old Dhaka, Jatrabari.
Civic terms: road, pothole, garbage, mosquito, streetlight, water, electricity, gas, construction, traffic, police.
Return ONLY the transcribed text in ${languageName} script. No explanation, no quotes, no markdown. If the audio has no speech, return empty string.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 1024 },
  });

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const err = new Error(`Gemini transcription failed: ${response.status} ${errText.slice(0, 300)}`);
        err.status = response.status;
        throw err;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text || '').join('').trim() || '';

      if (!text && candidate?.finishReason && candidate.finishReason !== 'STOP') {
        logger.warn({ finishReason: candidate.finishReason, model }, 'Gemini returned no transcript');
      }

      logger.info({ language, model, textLength: text.length, attempt }, 'Gemini transcription complete');
      return {
        text,
        language,
        duration: 0,
        segments: text ? [{ start: 0, end: 0, text }] : [],
      };
    } catch (e) {
      lastError = e;
      const status = e.status || 0;
      const transient = e.name === 'AbortError' || RETRYABLE_STATUS.has(status) || /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(e.message || '');
      logger.warn({ attempt, transient, status, err: e.message, model }, 'Gemini transcription attempt failed');
      if (!transient || attempt === MAX_RETRIES) break;
      await sleep(500 * Math.pow(2, attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error('Transcription timed out. Please try again.');
  }
  throw lastError || new Error('Transcription failed');
}
