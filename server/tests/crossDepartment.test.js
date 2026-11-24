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
import { segmentComplaint, splitIntoProblems, detectCategory } from '../src/services/segmentation.js';
import { buildDepartmentParts } from '../src/services/departmentParts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Automatic multi-problem segmentation', () => {
  test('splits a mixed-language statement into distinct problems', () => {
    const text = 'পানি নিকাশি বন্ধ আছে। রাস্তায় বড় গর্ত হয়েছে। Also there is a gas leak near the market.';
    const problems = splitIntoProblems(text);
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(detectCategory(problems[0])).toBe('sewerage');
    expect(detectCategory(problems[1])).toBe('road');
    expect(detectCategory(problems[2])).toBe('gas');
  });
});

describe('Cross-department complaints (automatic routing)', () => {
  let mongoServer;
  let wasaId, dnccId, wasaToken, dnccToken, complaintId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const docs = await Department.insertMany(departments);
    wasaId = docs.find((d) => d.jurisdictionType === 'WASA')._id;
    dnccId = docs.find((d) => d.jurisdictionType === 'DNCC')._id;

    const hash = await bcrypt.hash('pass123', 10);
    await User.insertMany([
      { name: 'WASA Officer', email: 'wasa@test.com', passwordHash: hash, role: 'department', department: wasaId },
      { name: 'DNCC Officer', email: 'dncc@test.com', passwordHash: hash, role: 'department', department: dnccId },
    ]);
    const login = async (email) => {
      const r = await request(app).post('/api/auth/login').send({ email, password: 'pass123' });
      return r.body.token;
    };
    wasaToken = await login('wasa@test.com');
    dnccToken = await login('dncc@test.com');

    const text = 'পানি নিকাশি বন্ধ আছে। রাস্তায় বড় গর্ত হয়েছে।';
    const segments = await segmentComplaint({
      text,
      extracted: { category: 'waterlogging', urgency: 'high', area: 'Gulshan' },
      area: 'Gulshan',
    });
    const deptDocs = await Department.find({}).select('_id nameEn nameBn jurisdictionType').lean();
    const departmentsById = Object.fromEntries(deptDocs.map((d) => [d._id.toString(), d]));
    const parts = buildDepartmentParts({ parts: segments, departmentsById, status: 'assigned' });
    const routedIds = [...new Set(parts.map((p) => p.department.toString()))];

    const complaint = await Complaint.create({
      trackingId: 'DHK-20261124-0100',
      category: 'waterlogging',
      description: text,
      area: 'Gulshan',
      urgency: 'high',
      confidence: 0.9,
      status: 'assigned',
      routing: routedIds.map((id, i) => ({
        department: id,
        isPrimary: i === 0,
        assignedBy: 'auto',
        reason: 'Automatically detected from complaint text',
      })),
      departmentParts: parts,
    });
    complaintId = complaint._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('text segmentation produced two different departments', async () => {
    const complaint = await Complaint.findById(complaintId).lean();
    const deptIds = complaint.departmentParts.map((p) => p.department.toString());
    expect(deptIds).toHaveLength(2);
    expect(deptIds).toContain(wasaId.toString());
    expect(deptIds).toContain(dnccId.toString());
  });

  test('WASA sees only its drainage part', async () => {
    const res = await request(app)
      .get(`/api/departments/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${wasaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.view.description).toContain('পানি নিকাশি');
    expect(res.body.view.description).not.toContain('গর্ত');
    expect(res.body.view.shared).toBe(true);
    expect(res.body.view.otherOfficesCount).toBe(1);
  });

  test('DNCC sees only its road part', async () => {
    const res = await request(app)
      .get(`/api/departments/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${dnccToken}`);
    expect(res.status).toBe(200);
    expect(res.body.view.description).toContain('গর্ত');
    expect(res.body.view.description).not.toContain('নিকাশি');
  });

  test('list responses are scoped per office', async () => {
    const wasa = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${wasaToken}`);
    const dncc = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${dnccToken}`);
    const wasaItem = wasa.body.complaints.find((c) => c.trackingId === 'DHK-20261124-0100');
    const dnccItem = dncc.body.complaints.find((c) => c.trackingId === 'DHK-20261124-0100');
    expect(wasaItem.displayDescription).not.toContain('গর্ত');
    expect(dnccItem.displayDescription).toContain('গর্ত');
    expect(wasaItem.routing).toHaveLength(1);
    expect(dnccItem.routing).toHaveLength(1);
  });

  test('each office updates only its own part status', async () => {
    const dnccUpdate = await request(app)
      .patch(`/api/departments/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${dnccToken}`)
      .send({ status: 'resolved', note: 'Road fixed' });
    expect(dnccUpdate.status).toBe(200);
    expect(dnccUpdate.body.view.status).toBe('resolved');

    const wasaView = await request(app)
      .get(`/api/departments/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${wasaToken}`);
    expect(wasaView.body.view.status).toBe('assigned');

    const wasaUpdate = await request(app)
      .patch(`/api/departments/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${wasaToken}`)
      .send({ status: 'resolved', note: 'Drain cleared' });
    expect(wasaUpdate.status).toBe(200);

    const complaint = await Complaint.findById(complaintId).lean();
    expect(complaint.departmentParts.every((p) => p.status === 'resolved')).toBe(true);
    expect(complaint.status).toBe('resolved');
  });

  test('track endpoint tells citizen the complaint is shared', async () => {
    const res = await request(app).get('/api/complaints/track/DHK-20261124-0100');
    expect(res.status).toBe(200);
    expect(res.body.shared).toBe(true);
    expect(res.body.departments).toHaveLength(2);
  });
});
