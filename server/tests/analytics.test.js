import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Analytics Tests', () => {
  let mongoServer;
  let adminToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const depts = await Department.insertMany(departments);

    // Create admin user
    const hash = await bcrypt.hash('admin123', 10);
    await User.create({ name: 'Admin', email: 'admin@test.com', passwordHash: hash, role: 'admin' });

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin123' });
    adminToken = loginRes.body.token;

    // Create test complaints
    const dept = depts[0];
    await Complaint.create([
      {
        trackingId: 'DHK-20261122-0001',
        category: 'road',
        description: 'Pothole',
        area: 'Dhanmondi',
        location: { type: 'Point', coordinates: [90.37, 23.75] },
        urgency: 'high',
        confidence: 0.9,
        status: 'resolved',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        statusLog: [
          { status: 'received', at: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          { status: 'resolved', at: new Date() },
        ],
        routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
      },
      {
        trackingId: 'DHK-20261122-0002',
        category: 'garbage',
        description: 'Garbage pile',
        area: 'Mirpur',
        location: { type: 'Point', coordinates: [90.36, 23.81] },
        urgency: 'medium',
        confidence: 0.85,
        status: 'assigned',
        routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
      },
      {
        trackingId: 'DHK-20261122-0003',
        category: 'road',
        description: 'Another pothole',
        area: 'Dhanmondi',
        location: { type: 'Point', coordinates: [90.37, 23.75] },
        urgency: 'low',
        confidence: 0.7,
        status: 'triage',
        routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
      },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  const authHeaders = () => ({ Authorization: `Bearer ${adminToken}` });

  test('complaints per area', async () => {
    const res = await request(app)
      .get('/api/analytics/complaints-per-area')
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    const dhanmondi = res.body.data.find((d) => d.area === 'Dhanmondi');
    expect(dhanmondi).toBeTruthy();
    expect(dhanmondi.count).toBe(2);
  });

  test('complaints per category', async () => {
    const res = await request(app)
      .get('/api/analytics/complaints-per-category')
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    const road = res.body.data.find((d) => d.category === 'road');
    expect(road).toBeTruthy();
    expect(road.count).toBe(2);
  });

  test('average resolution time', async () => {
    const res = await request(app)
      .get('/api/analytics/avg-resolution-time')
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.count).toBe(1);
    expect(res.body.data.avgResolutionHours).toBeGreaterThan(0);
  });

  test('department performance', async () => {
    const res = await request(app)
      .get('/api/analytics/department-performance')
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('department');
    expect(res.body.data[0]).toHaveProperty('total');
    expect(res.body.data[0]).toHaveProperty('resolved');
    expect(res.body.data[0]).toHaveProperty('resolutionRate');
  });

  test('auto-route rate', async () => {
    const res = await request(app)
      .get('/api/analytics/auto-route-rate')
      .set(authHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.autoRouted).toBe(1); // 1 assigned
    expect(res.body.data.triaged).toBe(1); // 1 triage
  });

  test('analytics is public (no auth required)', async () => {
    const res = await request(app).get('/api/analytics/complaints-per-area');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });
});
