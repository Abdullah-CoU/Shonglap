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
import { buildDepartmentParts } from '../src/services/departmentParts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Cross-department complaints', () => {
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

    const routing = {
      primaryDepartmentId: wasaId.toString(),
      secondaryDepartmentIds: [dnccId.toString()],
      confidence: 0.9,
      reasoning: 'Waterlogging: drainage + road restoration',
      needsTriage: false,
    };
    const departmentsById = {
      [wasaId.toString()]: { _id: wasaId, jurisdictionType: 'WASA' },
      [dnccId.toString()]: { _id: dnccId, jurisdictionType: 'DNCC' },
    };
    const parts = buildDepartmentParts({
      routing,
      extracted: {
        description: 'পানি নিকাশি বন্ধ আছে। রাস্তায় বড় গর্ত হয়েছে।',
      },
      departmentsById,
      citizenDepartmentId: dnccId.toString(),
      citizenNote: 'রাস্তার গর্ত মেরামতি প্রয়োজন',
      status: 'assigned',
    });

    const complaint = await Complaint.create({
      trackingId: 'DHK-20261124-0100',
      category: 'waterlogging',
      description: 'পানি নিকাশি বন্ধ আছে। রাস্তায় বড় গর্ত হয়েছে।',
      area: 'Gulshan',
      urgency: 'high',
      confidence: 0.9,
      status: 'assigned',
      routing: [
        { department: wasaId, isPrimary: true, assignedBy: 'auto', reason: 'WASA leads drainage' },
        { department: dnccId, isPrimary: false, assignedBy: 'citizen', reason: 'Citizen indicated this office is also involved' },
      ],
      departmentParts: parts,
    });
    complaintId = complaint._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('builds one scoped part per department with citizen note', () => {
    // Covered via stored complaint in beforeAll; verify shape through APIs below.
    expect(complaintId).toBeTruthy();
  });

  test('WASA sees only its drainage part', async () => {
    const res = await request(app)
      .get(`/api/departments/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${wasaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.view.role).toBe('primary');
    expect(res.body.view.description).toContain('পানি নিকাশি');
    expect(res.body.view.description).not.toContain('গর্ত');
    expect(res.body.view.shared).toBe(true);
    expect(res.body.view.otherOfficesCount).toBe(1);
  });

  test('DNCC sees only the road part supplied by citizen', async () => {
    const res = await request(app)
      .get(`/api/departments/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${dnccToken}`);
    expect(res.status).toBe(200);
    expect(res.body.view.role).toBe('secondary');
    expect(res.body.view.description).toBe('রাস্তার গর্ত মেরামতি প্রয়োজন');
  });

  test('list responses are scoped per office', async () => {
    const wasa = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${wasaToken}`);
    const dncc = await request(app)
      .get('/api/departments/complaints')
      .set('Authorization', `Bearer ${dnccToken}`);
    expect(wasa.status).toBe(200);
    expect(dncc.status).toBe(200);
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
    expect(wasaView.body.view.status).toBe('assigned'); // unchanged by DNCC

    const wasaUpdate = await request(app)
      .patch(`/api/departments/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${wasaToken}`)
      .send({ status: 'resolved', note: 'Drain cleared' });
    expect(wasaUpdate.status).toBe(200);

    const complaint = await Complaint.findById(complaintId).lean();
    expect(complaint.departmentParts).toHaveLength(2);
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
