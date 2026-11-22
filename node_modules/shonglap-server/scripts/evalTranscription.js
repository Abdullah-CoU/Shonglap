import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { transcribeAudio } from '../src/services/transcription/index.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Levenshtein distance for WER
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

function computeWER(reference, hypothesis) {
  const refWords = reference.split(/\s+/).filter(Boolean);
  const hypWords = hypothesis.split(/\s+/).filter(Boolean);
  const dist = levenshtein(refWords, hypWords);
  return refWords.length > 0 ? dist / refWords.length : 0;
}

const main = async () => {
  // Load reference transcripts
  let samples;
  try {
    samples = JSON.parse(readFileSync(join(__dirname, '..', '..', 'data', 'transcription_samples.json'), 'utf-8'));
  } catch {
    console.log('No transcription_samples.json found. Creating template...');
    const template = Array.from({ length: 10 }, (_, i) => ({
      id: `sample_${i + 1}`,
      audioFile: `data/samples/bangla_${i + 1}.wav`,
      reference: 'Reference transcript here',
      provider: 'all',
    }));
    console.log(JSON.stringify(template, null, 2));
    process.exit(0);
  }

  const providers = ['openai', 'whispercpp', 'sidecar'];
  const results = {};

  for (const provider of providers) {
    if (process.env.TRANSCRIBE_PROVIDER !== provider && process.env.TRANSCRIBE_PROVIDER !== 'all') {
      // Skip if not configured for this provider
    }
    results[provider] = { wers: [], avgWER: 0 };
  }

  // For mock mode, just report
  if (process.env.MOCK_TRANSCRIPTION === 'true') {
    console.log('MOCK_TRANSCRIPTION enabled - skipping real transcription');
    console.log('To run real eval, set MOCK_TRANSCRIPTION=false and provide audio samples');
    process.exit(0);
  }

  for (const sample of samples) {
    console.log(`\nProcessing ${sample.id}...`);
    for (const provider of providers) {
      try {
        process.env.TRANSCRIBE_PROVIDER = provider;
        const result = await transcribeAudio(sample.audioFile, { language: 'bn' });
        const wer = computeWER(sample.reference, result.text);
        results[provider].wers.push({ id: sample.id, wer, text: result.text });
        console.log(`  ${provider}: WER=${(wer * 100).toFixed(1)}%`);
      } catch (err) {
        console.log(`  ${provider}: ERROR - ${err.message}`);
        results[provider].wers.push({ id: sample.id, wer: 1, error: err.message });
      }
    }
  }

  console.log('\n=== Transcription WER Report ===');
  for (const provider of providers) {
    const wers = results[provider].wers.map((w) => w.wer);
    const avg = wers.length > 0 ? wers.reduce((a, b) => a + b, 0) / wers.length : 0;
    console.log(`${provider}: Avg WER = ${(avg * 100).toFixed(1)}% (${wers.length} samples)`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
