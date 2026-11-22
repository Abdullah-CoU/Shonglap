import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Duplicate Detection Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Seed departments
    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    await Department.insertMany(departments);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Complaint.deleteMany({});
  });

  test('check-duplicate endpoint returns no duplicates when none exist', async () => {
    const res = await request(app)
      .post('/api/complaints/check-duplicate')
      .send({ lat: 23.75, lng: 90.37, category: 'road', area: 'Dhanmondi' });

    expect(res.status).toBe(200);
    expect(res.body.hasDuplicates).toBe(false);
    expect(res.body.duplicates).toHaveLength(0);
  });

  test('finds duplicate within 100m and 7 days', async () => {
    // Create a complaint
    const complaint = await Complaint.create({
      trackingId: 'DHK-20261122-0001',
      category: 'road',
      description: 'Pothole on road',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'medium',
      confidence: 0.9,
      status: 'received',
    });

    const res = await request(app)
      .post('/api/complaints/check-duplicate')
      .send({ lat: 23.7501, lng: 90.3701, category: 'road', area: 'Dhanmondi' });

    expect(res.status).toBe(200);
    expect(res.body.hasDuplicates).toBe(true);
    expect(res.body.duplicates.length).toBeGreaterThan(0);
    expect(res.body.duplicates[0].trackingId).toBe('DHK-20261122-0001');
  });

  test('does not find duplicates beyond 100m', async () => {
    await Complaint.create({
      trackingId: 'DHK-20261122-0002',
      category: 'road',
      description: 'Pothole far away',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'medium',
      confidence: 0.9,
      status: 'received',
    });

    const res = await request(app)
      .post('/api/complaints/check-duplicate')
      .send({ lat: 23.76, lng: 90.38, category: 'road', area: 'Dhanmondi' }); // ~1.5km away

    expect(res.status).toBe(200);
    expect(res.body.hasDuplicates).toBe(false);
  });

  test('does not find duplicates with different category', async () => {
    await Complaint.create({
      trackingId: 'DHK-20261122-0003',
      category: 'road',
      description: 'Pothole',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'medium',
      confidence: 0.9,
      status: 'received',
    });

    const res = await request(app)
      .post('/api/complaints/check-duplicate')
      .send({ lat: 23.75, lng: 90.37, category: 'garbage', area: 'Dhanmondi' });

    expect(res.status).toBe(200);
    expect(res.body.hasDuplicates).toBe(false);
  });

  test('support endpoint increments supporters', async () => {
    await Complaint.create({
      trackingId: 'DHK-20261122-0004',
      category: 'road',
      description: 'Pothole',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'medium',
      confidence: 0.9,
      status: 'received',
      supporters: 0,
    });

    const res = await request(app).post('/api/complaints/DHK-20261122-0004/support');

    expect(res.status).toBe(200);
    expect(res.body.supporters).toBe(1);
    expect(res.body.message).toBe('Support added');

    // Second support
    const res2 = await request(app).post('/api/complaints/DHK-20261122-0004/support');
    expect(res2.body.supporters).toBe(2);
  });

  test('submit returns duplicate info when duplicate exists', async () => {
    // Create existing complaint
    await Complaint.create({
      trackingId: 'DHK-20261122-0005',
      category: 'road',
      description: 'Existing pothole',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'medium',
      confidence: 0.9,
      status: 'received',
    });

    // Create a draft
    const draftRes = await request(app)
      .post('/api/complaints/draft')
      .send({
        text: 'Another pothole on Dhanmondi Road',
        lat: 23.75,
        lng: 90.37,
        language: 'en',
      });

    expect(draftRes.status).toBe(201);

    // Submit should return duplicate info
    const submitRes = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId: draftRes.body.draftId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.duplicate).toBe(true);
    expect(submitRes.body.duplicates.length).toBeGreaterThan(0);

    // Force submit should create new complaint
    const forceRes = await request(app)
      .post('/api/complaints/submit')
      .send({ draftId: draftRes.body.draftId, force: true });

    expect(forceRes.status).toBe(201);
    expect(forceRes.body.trackingId).toBeTruthy();
  });
});
