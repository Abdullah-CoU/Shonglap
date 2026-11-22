import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import app from '../src/app.js';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Complaints Flow Integration Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Seed departments and jurisdictions
    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const depts = await Department.insertMany(departments);

    const deptMap = {};
    for (const d of depts) {
      deptMap[d.jurisdictionType] = d._id;
      if (d.nameEn === 'Dhaka North City Corporation') deptMap['DNCC'] = d._id;
      if (d.nameEn === 'Dhaka South City Corporation') deptMap['DSCC'] = d._id;
      if (d.nameEn === 'Dhaka Power Distribution Company') deptMap['DPDC'] = d._id;
      if (d.nameEn === 'Dhaka Electric Supply Company') deptMap['DESCO'] = d._id;
    }

    const jurisdictions = JSON.parse(readFileSync(join(DATA_DIR, 'jurisdictions.json'), 'utf-8'));
    const entries = [];
    for (const j of jurisdictions) {
      if (j.cityCorp && deptMap[j.cityCorp]) {
        entries.push({ department: deptMap[j.cityCorp], areaName: j.areaName, wards: j.wards, verified: false });
      }
      if (j.powerZone && deptMap[j.powerZone]) {
        entries.push({ department: deptMap[j.powerZone], areaName: j.areaName, wards: j.wards, verified: false });
      }
    }
    await Jurisdiction.insertMany(entries);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('Full flow: draft -> answer -> submit -> track', async () => {
    // Step 1: Create draft
    const draftRes = await request(app)
      .post('/api/complaints/draft')
      .send({
        text: 'There is a huge pothole on Dhanmondi Road 27 causing traffic jam.',
        language: 'en',
      });

    expect(draftRes.status).toBe(201);
    expect(draftRes.body.draftId).toBeTruthy();
    expect(draftRes.body.extracted).toBeTruthy();
    expect(draftRes.body.extracted.category).toBe('road');
    expect(draftRes.body.routing).toBeTruthy();
    expect(draftRes.body.routing.primary).toBeTruthy();
    expect(draftRes.body.routing.primary.nameEn).toContain('Dhaka');
    expect(draftRes.body.missingFields).toBeDefined();
    expect(draftRes.body.followUpQuestions).toBeDefined();
    expect(Array.isArray(draftRes.body.followUpQuestions)).toBe(true);
    expect(draftRes.body.followUpQuestions.length).toBeLessThanOrEqual(2);
    expect(draftRes.body.conflicts).toBeDefined();

    const draftId = draftRes.body.draftId;

    // Step 2: Answer follow-up (provide area)
    const answerRes = await request(app)
      .post(`/api/complaints/draft/${draftId}/answer`)
      .send({
        answers: { area: 'Dhanmondi' },
      });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.draftId).toBe(draftId);
    expect(answerRes.body.extracted).toBeTruthy();
    expect(answerRes.body.routing.primary).toBeTruthy();

    // Step 3: Submit
    const submitRes = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.trackingId).toBeTruthy();
    expect(submitRes.body.trackingId).toMatch(/^DHK-\d{8}-\d{4}$/);

    const trackingId = submitRes.body.trackingId;

    // Step 4: Track (public, no personal data)
    const trackRes = await request(app).get(`/api/complaints/track/${trackingId}`);

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.trackingId).toBe(trackingId);
    expect(trackRes.body.category).toBe('road');
    expect(trackRes.body.status).toBeTruthy();
    expect(trackRes.body.timeline).toBeDefined();
    expect(Array.isArray(trackRes.body.timeline)).toBe(true);
    expect(trackRes.body.timeline.length).toBeGreaterThan(0);
    // No personal data
    expect(trackRes.body.contactPhone).toBeUndefined();
    expect(trackRes.body.contactEmail).toBeUndefined();
  });

  test('Draft creation with minimal input', async () => {
    const res = await request(app)
      .post('/api/complaints/draft')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.draftId).toBeTruthy();
    expect(res.body.extracted).toBeTruthy();
  });

  test('Draft not found returns 404', async () => {
    const res = await request(app)
      .post('/api/complaints/draft/nonexistent-id/answer')
      .send({ answers: {} });

    expect(res.status).toBe(404);
  });

  test('Submit with invalid draftId returns 404', async () => {
    const res = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId: 'nonexistent-id' });

    expect(res.status).toBe(404);
  });

  test('Track non-existent trackingId returns 404', async () => {
    const res = await request(app).get('/api/complaints/track/DHK-20260101-9999');
    expect(res.status).toBe(404);
  });

  test('Spam text rejected on draft', async () => {
    const res = await request(app)
      .post('/api/complaints/draft')
      .send({ text: 'Buy cheap products now click here free money win lottery' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Spam');
  });

  test('Zod validation rejects invalid draft body', async () => {
    const res = await request(app)
      .post('/api/complaints/draft')
      .send({ lat: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Validation');
  });

  test('Follow-up answer sets area and submit succeeds (regression)', async () => {
    // Report without selecting area (text has no area name)
    const draftRes = await request(app)
      .post('/api/complaints/draft')
      .send({ text: 'Road is damaged with a big pothole', language: 'en' });

    expect(draftRes.status).toBe(201);
    // Answer the area follow-up question
    const answerRes = await request(app)
      .post(`/api/complaints/draft/${draftRes.body.draftId}/answer`)
      .send({ answers: { area: 'Uttara' } });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.extracted.area).toBeTruthy();

    // Submit should succeed (area now set)
    const submitRes = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId: draftRes.body.draftId });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.trackingId).toMatch(/^DHK-\d{8}-\d{4}$/);

    // Track should show area
    const trackRes = await request(app).get(`/api/complaints/track/${submitRes.body.trackingId}`);
    expect(trackRes.status).toBe(200);
    expect(trackRes.body.area).toBeTruthy();
  });

  test('Draft creation with Bangla text', async () => {
    const res = await request(app)
      .post('/api/complaints/draft')
      .send({
        text: 'গুলশান ২ নম্বর রোডে বড় গর্ত হয়েছে।',
        language: 'bn',
      });

    expect(res.status).toBe(201);
    expect(res.body.extracted.languageDetected).toBe('bn');
    expect(res.body.extracted.category).toBe('road');
  });

  test('Multiple drafts get unique tracking IDs', async () => {
    const draft1 = await request(app)
      .post('/api/complaints/draft')
      .send({ text: 'Garbage pile in Mirpur.' });
    const draft2 = await request(app)
      .post('/api/complaints/draft')
      .send({ text: 'Street light broken in Gulshan.' });

    const submit1 = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId: draft1.body.draftId });
    const submit2 = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId: draft2.body.draftId });

    expect(submit1.body.trackingId).not.toBe(submit2.body.trackingId);
  });
});
