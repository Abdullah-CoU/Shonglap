import { readFile } from 'fs/promises';
import { basename } from 'path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const DHAKA_PROMPT =
  env.WHISPER_PROMPT ||
  'Dhaka, Bangladesh civic complaint. Common areas: Gulshan, Banani, Dhanmondi, Uttara, Mirpur, Motijheel, Old Dhaka, Jatrabari, Mohammadpur, Tejgaon, Badda, Rampura, Baridhara, Mohakhali, Kafrul, Cantonment, Wari, Lalbagh, Sutrapur, Gendaria, Shyampur, Demra, Kadamtali, Adabar, Hazaribagh, Savar. Civic terms: road, pothole, garbage, waste, mosquito, dengue, streetlight, water, sewerage, waterlogging, electricity, power, gas leak, construction, illegal, traffic, jam, police, fire, pollution, noise.';

/**
 * Transcribe audio using OpenAI's Whisper API.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {Object} [options]
 * @param {string} [options.language='bn'] - Language code.
 * @returns {Promise<{text: string, language: string, duration: number, segments: Array}>}
 */
export async function transcribe(filePath, { language = 'bn' } = {}) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const fileBuffer = await readFile(filePath);
  const fileName = basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer]), fileName);
  formData.append('model', env.OPENAI_TRANSCRIBE_MODEL);
  formData.append('language', language);
  formData.append('prompt', DHAKA_PROMPT);
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI transcription failed: ${response.status} ${errText}`);
  }

  const data = await response.json();

  return {
    text: data.text || '',
    language: data.language || language,
    duration: data.duration || 0,
    segments: data.segments || [],
  };
}
