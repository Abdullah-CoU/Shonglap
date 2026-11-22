import { readFile } from 'fs/promises';
import { basename } from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Transcribe audio using Google Gemini's multimodal API.
 * Fast and accurate for Bangla — no local model needed.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {Object} [options]
 * @param {string} [options.language='bn'] - Language code.
 * @returns {Promise<{text: string, language: string, duration: number, segments: Array}>}
 */
export async function transcribe(filePath, { language = 'bn' } = {}) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is not configured');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const buffer = await readFile(filePath);
  const base64 = buffer.toString('base64');

  // Infer MIME type from extension
  const name = basename(filePath).toLowerCase();
  let mimeType = 'audio/webm';
  if (name.endsWith('.mp3')) mimeType = 'audio/mpeg';
  else if (name.endsWith('.wav')) mimeType = 'audio/wav';
  else if (name.endsWith('.m4a') || name.endsWith('.mp4')) mimeType = 'audio/mp4';
  else if (name.endsWith('.ogg')) mimeType = 'audio/ogg';

  const languageName = language === 'bn' ? 'Bangla (বাংলা)' : language === 'en' ? 'English' : language;

  const prompt = `Transcribe this audio recording exactly as spoken in ${languageName}.
This is a civic complaint in Dhaka, Bangladesh. Common areas: Gulshan, Banani, Dhanmondi, Uttara, Mirpur, Motijheel, Old Dhaka, Jatrabari.
Civic terms: road, pothole, garbage, mosquito, streetlight, water, electricity, gas, construction, traffic, police.
Return ONLY the transcribed text in ${languageName} script. No explanation, no quotes, no markdown. If the audio has no speech, return empty string.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
    });
  } catch (e) {
    throw new Error(`Gemini API request failed: ${e.message}`);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini transcription failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

  logger.info({ language, model, textLength: text.length }, 'Gemini transcription complete');

  return {
    text,
    language,
    duration: 0,
    segments: text ? [{ start: 0, end: 0, text }] : [],
  };
}
