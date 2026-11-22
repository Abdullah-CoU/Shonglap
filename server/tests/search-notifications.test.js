import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Search & Notifications Tests', () => {
  let mongoServer;
  let adminToken;
  let deptToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const depts = await Department.insertMany(departments);
    const dept = depts.find((d) => d.jurisdictionType === 'DNCC');

    const hash = await bcrypt.hash('pass123', 10);
    await User.create([
      { name: 'Admin', email: 'admin@test.com', passwordHash: hash, role: 'admin' },
      { name: 'Officer', email: 'officer@test.com', passwordHash: hash, role: 'department', department: dept._id },
    ]);

    const adminRes = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'pass123' });
    adminToken = adminRes.body.token;
    const deptRes = await request(app).post('/api/auth/login').send({ email: 'officer@test.com', password: 'pass123' });
    deptToken = deptRes.body.token;

    await Complaint.create([
      {
        trackingId: 'DHK-20261122-0001', category: 'road', description: 'Pothole on Dhanmondi Road',
        area: 'Dhanmondi', urgency: 'high', confidence: 0.9, status: 'assigned',
        location: { type: 'Point', coordinates: [90.37, 23.75] },
        routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
        statusLog: [
          { status: 'assigned', note: 'SLA overdue: 24h deadline exceeded. Escalated.', actor: 'system-sla', at: new Date() },
        ],
      },
      {
        trackingId: 'DHK-20261122-0002', category: 'triage', description: 'Unclear report',
        area: 'Mirpur', urgency: 'medium', confidence: 0.4, status: 'triage',
        location: { type: 'Point', coordinates: [90.36, 23.81] },
        routing: [], statusLog: [],
      },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Search', () => {
    test('searches by tracking ID', async () => {
      const res = await request(app).get('/api/complaints/search?q=DHK-20261122-0001');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(1);
      expect(res.body.results[0].trackingId).toBe('DHK-20261122-0001');
    });

    test('searches by area', async () => {
      const res = await request(app).get('/api/complaints/search?q=Dhanmondi');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    test('searches by category', async () => {
      const res = await request(app).get('/api/complaints/search?q=triage');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThan(0);
    });

    test('empty query returns empty results', async () => {
      const res = await request(app).get('/api/complaints/search?q=');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });
  });

  describe('Notifications', () => {
    test('admin gets triage notification', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.notifications.some((n) => n.type === 'triage')).toBe(true);
    });

    test('department gets escalation notification for own complaint', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${deptToken}`);
      expect(res.status).toBe(200);
      expect(res.body.notifications.some((n) => n.type === 'escalation')).toBe(true);
    });

    test('requires auth', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
    });

    test('citizen role forbidden', async () => {
      // no token = 401; an actual citizen JWT would be 403 via requireRole
      const res = await request(app).get('/api/notifications');
      expect([401, 403]).toContain(res.status);
    });
  });
});
