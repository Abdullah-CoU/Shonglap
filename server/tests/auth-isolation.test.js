import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Auth & Department Isolation Tests', () => {
  let mongoServer;
  let dnccToken, dsccToken, adminToken, noDeptToken;
  let dnccId, dsccId, complaintId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const depts = await Department.insertMany(departments);
    dnccId = depts.find((d) => d.jurisdictionType === 'DNCC')._id;
    dsccId = depts.find((d) => d.jurisdictionType === 'DSCC')._id;

    const hash = await bcrypt.hash('pass123', 10);
    await User.insertMany([
      { name: 'Admin', email: 'admin@test.com', passwordHash: hash, role: 'admin' },
      { name: 'DNCC Officer', email: 'dncc@test.com', passwordHash: hash, role: 'department', department: dnccId },
      { name: 'DSCC Officer', email: 'dscc@test.com', passwordHash: hash, role: 'department', department: dsccId },
      { name: 'No Dept', email: 'nodept@test.com', passwordHash: hash, role: 'department', department: null },
    ]);

    const login = async (email) => {
      const r = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
      return r.body.token;
    };
    adminToken = await login('admin@test.com');
    dnccToken = await login('dncc@test.com');
    dsccToken = await login('dscc@test.com');
    noDeptToken = await login('nodept@test.com');

    const complaint = await Complaint.create({
      trackingId: 'DHK-20261123-0001', category: 'road', description: 'DNCC pothole',
      area: 'Gulshan', urgency: 'high', confidence: 0.9, status: 'assigned',
      location: { type: 'Point', coordinates: [90.42, 23.79] },
      routing: [{ department: dnccId, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
    });
    complaintId = complaint._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('admin login returns admin token', async () => {
    expect(adminToken).toBeTruthy();
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('admin');
  });

  test('department login returns own department', async () => {
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${dnccToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('department');
    expect(me.body.user.department.nameEn).toContain('North');
  });

  test('department with no department cannot login', async () => {
    expect(noDeptToken).toBeUndefined();
  });

  test('DNCC officer can list own complaint', async () => {
    const res = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${dnccToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.complaints[0].trackingId).toBe('DHK-20261123-0001');
  });

  test('DSCC officer cannot see DNCC complaint in list', async () => {
    const res = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${dsccToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('DSCC officer cannot GET DNCC complaint detail', async () => {
    const res = await request(app)
      .get(`/api/departments/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${dsccToken}`);
    expect(res.status).toBe(403);
  });

  test('DSCC officer cannot PATCH DNCC complaint status', async () => {
    const res = await request(app)
      .patch(`/api/departments/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${dsccToken}`)
      .send({ status: 'resolved' });
    expect(res.status).toBe(403);

    const check = await Complaint.findById(complaintId).lean();
    expect(check.status).toBe('assigned');
  });

  test('department cannot access admin triage endpoint', async () => {
    const res = await request(app)
      .get('/api/admin/triage')
      .set('Authorization', `Bearer ${dnccToken}`);
    expect(res.status).toBe(403);
  });

  test('admin can access triage endpoint', async () => {
    const res = await request(app)
      .get('/api/admin/triage')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('no token is rejected', async () => {
    const res = await request(app).get('/api/departments/complaints');
    expect(res.status).toBe(401);
  });

  test('tampered token is rejected', async () => {
    const fake = dnccToken.slice(0, -5) + 'xxxxx';
    const res = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${fake}`);
    expect(res.status).toBe(401);
  });

  test('wrong password rejected', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dncc@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
