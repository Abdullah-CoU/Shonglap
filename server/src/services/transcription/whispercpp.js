import { spawn } from 'child_process';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Transcribe audio using whisper.cpp binary via child_process.
 *
 * @param {string} filePath - Path to the audio file (should be 16kHz mono WAV).
 * @param {Object} [options]
 * @param {string} [options.language='bn'] - Language code.
 * @returns {Promise<{text: string, language: string, duration: number, segments: Array}>}
 */
export async function transcribe(filePath, { language = 'bn' } = {}) {
  const binaryPath = process.env.WHISPER_CPP_BINARY || 'whisper-cpp';
  const modelPath = process.env.WHISPER_CPP_MODEL || `models/ggml-${env.WHISPERCPP_MODEL}.bin`;

  const args = [
    '-m', modelPath,
    '-f', filePath,
    '-l', language,
    '--output-json',
    '--print-progress', 'false',
  ];

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`whisper.cpp binary not found or failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`whisper.cpp exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // whisper.cpp --output-json writes to stdout or a file; try parsing stdout
        const parsed = JSON.parse(stdout);
        const text = parsed.text || (parsed.transcription || []).map((s) => s.text).join(' ');
        const segments = (parsed.transcription || []).map((s) => ({
          start: s.offsets?.from || s.start || 0,
          end: s.offsets?.to || s.end || 0,
          text: s.text || '',
        }));
        const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;

        resolve({
          text: text.trim(),
          language,
          duration,
          segments,
        });
      } catch (e) {
        // Fallback: treat stdout as plain text
        resolve({
          text: stdout.trim(),
          language,
          duration: 0,
          segments: [],
        });
      }
    });
  });
}
