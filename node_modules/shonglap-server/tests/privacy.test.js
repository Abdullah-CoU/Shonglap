import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { applyPrivacyBlur } from '../src/utils/privacy.js';
import { stat } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PATH = join(__dirname, '..', '..', 'data', 'samples', 'test_photo.jpg');

describe('Privacy Blur Tests', () => {
  test('applyPrivacyBlur creates a blurred image', async () => {
    const outputPath = join(__dirname, '..', '..', 'data', 'samples', 'test_photo_blurred.jpg');
    const result = await applyPrivacyBlur(SAMPLE_PATH, outputPath);
    expect(result).toBe(outputPath);

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('isPrivacyBlurEnabled returns boolean', async () => {
    const { isPrivacyBlurEnabled } = await import('../src/utils/privacy.js');
    expect(typeof isPrivacyBlurEnabled()).toBe('boolean');
  });
});
