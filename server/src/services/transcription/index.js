import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import * as openaiProvider from './openai.js';
import * as whispercppProvider from './whispercpp.js';
import * as sidecarProvider from './sidecar.js';

const PROVIDERS = {
  openai: openaiProvider,
  whispercpp: whispercppProvider,
  sidecar: sidecarProvider,
};

const MOCK_TRANSCRIPT = 'গুলশান ২ নম্বর রোডে বড় গর্ত হয়েছে, গাড়ি চলতে পারছে না।';

/**
 * Transcribe an audio file to text using the configured provider.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {Object} [options]
 * @param {string} [options.language='bn'] - Language code.
 * @returns {Promise<{text: string, language: string, duration: number, segments: Array}>}
 */
export async function transcribeAudio(filePath, { language = 'bn' } = {}) {
  if (env.MOCK_TRANSCRIPTION) {
    logger.info('MOCK_TRANSCRIPTION enabled, returning fixed Bangla sentence');
    return {
      text: MOCK_TRANSCRIPT,
      language: 'bn',
      duration: 5.2,
      segments: [{ start: 0, end: 5.2, text: MOCK_TRANSCRIPT }],
    };
  }

  const providerName = env.TRANSCRIBE_PROVIDER;
  const provider = PROVIDERS[providerName];

  if (!provider) {
    throw new Error(`Unknown transcription provider: ${providerName}`);
  }

  logger.info({ provider: providerName, filePath }, 'Transcribing audio');
  return provider.transcribe(filePath, { language });
}
