import request from 'supertest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import app from '../src/app.js';
import { analyzePhoto, saveOriginal } from '../src/services/vision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLE_PATH = join(__dirname, '..', '..', 'data', 'samples', 'test_photo.jpg');

describe('Vision Service Tests', () => {
  test('analyzePhoto returns valid structure in MOCK mode', async () => {
    const result = await analyzePhoto(SAMPLE_PATH);
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('detectedIssue');
    expect(result).toHaveProperty('suggestedCategory');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('isRelevant');
    expect(result).toHaveProperty('exifLat');
    expect(result).toHaveProperty('exifLng');
    expect(result).toHaveProperty('qualityWarning');
    expect(result).toHaveProperty('conflict');
    expect(['low', 'medium', 'high', 'critical']).toContain(result.severity);
  });

  test('conflict check: text and photo different categories', async () => {
    const result = await analyzePhoto(SAMPLE_PATH, { text: 'Gas leak in kitchen, emergency!' });
    expect(result.conflict).toBe(true); // photo says road, text says gas
  });

  test('conflict check: text and photo same category', async () => {
    const result = await analyzePhoto(SAMPLE_PATH, { text: 'Big pothole on the road' });
    expect(result.conflict).toBe(false); // both road
  });

  test('POST /api/analyze-photo returns analysis', async () => {
    const res = await request(app)
      .post('/api/analyze-photo')
      .attach('photo', SAMPLE_PATH);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('description');
    expect(res.body).toHaveProperty('suggestedCategory');
    expect(res.body).toHaveProperty('savedPath');
    expect(res.body.savedPath).toContain('uploads');
  });

  test('POST /api/analyze-photo returns 400 without photo', async () => {
    const res = await request(app).post('/api/analyze-photo');
    expect(res.status).toBe(400);
  });

  test('rejects oversized file', async () => {
    // Create a large buffer
    const largeBuffer = Buffer.alloc(9 * 1024 * 1024); // 9MB
    const { writeFile } = await import('fs/promises');
    const { join: j } = await import('path');
    const { tmpdir } = await import('os');
    const largePath = j(tmpdir(), 'large_test.jpg');
    await writeFile(largePath, largeBuffer);

    await expect(analyzePhoto(largePath)).rejects.toThrow(/exceeds limit/);
  });

  test('saveOriginal creates file in uploads with UUID name', async () => {
    const savedPath = await saveOriginal(SAMPLE_PATH, 'test_photo.jpg');
    expect(savedPath).toContain('uploads');
    expect(savedPath).toMatch(/[0-9a-f-]{36}\.jpg$/);
  });
});
