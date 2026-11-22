import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { extractComplaint } from '../src/services/extraction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Extraction Service Tests', () => {
  const samples = JSON.parse(readFileSync(join(DATA_DIR, 'sample_complaints.json'), 'utf-8'));

  // Pick 10 diverse samples
  const testSamples = [
    samples.find((s) => s.text.includes('pothole') && s.text.includes('Dhanmondi')),
    samples.find((s) => s.expectedCategory === 'garbage' && s.text.includes('Mirpur')),
    samples.find((s) => s.expectedCategory === 'mosquito'),
    samples.find((s) => s.expectedCategory === 'waterlogging'),
    samples.find((s) => s.expectedUrgency === 'critical' && s.expectedCategory === 'electricity'),
    samples.find((s) => s.expectedUrgency === 'critical' && s.expectedCategory === 'gas'),
    samples.find((s) => s.expectedCategory === 'construction'),
    samples.find((s) => s.expectedCategory === 'spam' && s.text.includes('lottery')),
    samples.find((s) => s.expectedCategory === 'streetlight'),
    samples.find((s) => s.text.includes('Dhanmondi') && s.expectedCategory === 'water'),
  ].filter(Boolean);

  test('should extract 10 sample complaints correctly', async () => {
    const results = [];

    for (const sample of testSamples) {
      const extracted = await extractComplaint({ text: sample.text });
      const categoryMatch = extracted.category === sample.expectedCategory;
      const urgencyMatch = extracted.urgency === sample.expectedUrgency;
      const pass = categoryMatch && urgencyMatch;

      results.push({
        text: sample.text.substring(0, 50),
        expectedCategory: sample.expectedCategory,
        gotCategory: extracted.category,
        expectedUrgency: sample.expectedUrgency,
        gotUrgency: extracted.urgency,
        pass: pass ? 'PASS' : 'FAIL',
      });
    }

    // Print pass/fail table
    console.log('\n========== EXTRACTION TEST RESULTS ==========');
    console.log(
      'Text'.padEnd(52) +
        'ExpCat'.padEnd(14) +
        'GotCat'.padEnd(14) +
        'ExpUrg'.padEnd(12) +
        'GotUrg'.padEnd(12) +
        'Result'
    );
    console.log('-'.repeat(116));
    for (const r of results) {
      console.log(
        r.text.padEnd(52) +
          r.expectedCategory.padEnd(14) +
          r.gotCategory.padEnd(14) +
          r.expectedUrgency.padEnd(12) +
          r.gotUrgency.padEnd(12) +
          r.pass
      );
    }
    console.log('='.repeat(116));
    const passCount = results.filter((r) => r.pass === 'PASS').length;
    console.log(`Passed: ${passCount}/${results.length}`);
    console.log('=============================================\n');

    // All should pass
    expect(passCount).toBe(results.length);
  }, 30000);
});
