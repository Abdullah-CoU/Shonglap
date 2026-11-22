import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Complaint } from '../src/models/Complaint.js';
import { Department } from '../src/models/Department.js';
import { checkSLA } from '../src/services/sla.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('SLA Escalation Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

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

  test('flags overdue complaint and adds escalation entry', async () => {
    const dept = await Department.findOne({ jurisdictionType: 'WASA' });

    // Create a complaint that is 48 hours old (SLA for water is 24h)
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const complaint = await Complaint.create({
      trackingId: 'DHK-20261122-0001',
      category: 'water',
      description: 'No water supply',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'high',
      confidence: 0.9,
      status: 'assigned',
      createdAt: oldDate,
      routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
    });

    const result = await checkSLA();
    expect(result.checked).toBe(1);
    expect(result.escalated).toBe(1);

    const updated = await Complaint.findById(complaint._id).lean();
    const escalationEntry = updated.statusLog.find((e) => e.note?.includes('SLA overdue'));
    expect(escalationEntry).toBeTruthy();
    expect(escalationEntry.actor).toBe('system-sla');
  });

  test('does not escalate non-overdue complaint', async () => {
    const dept = await Department.findOne({ jurisdictionType: 'WASA' });

    const complaint = await Complaint.create({
      trackingId: 'DHK-20261122-0002',
      category: 'water',
      description: 'No water supply',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'high',
      confidence: 0.9,
      status: 'assigned',
      createdAt: new Date(), // just created
      routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
    });

    const result = await checkSLA();
    expect(result.checked).toBe(1);
    expect(result.escalated).toBe(0);

    const updated = await Complaint.findById(complaint._id).lean();
    const escalationEntry = updated.statusLog?.find((e) => e.note?.includes('SLA overdue'));
    expect(escalationEntry).toBeFalsy();
  });

  test('does not double-escalate', async () => {
    const dept = await Department.findOne({ jurisdictionType: 'WASA' });

    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await Complaint.create({
      trackingId: 'DHK-20261122-0003',
      category: 'water',
      description: 'No water supply',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'high',
      confidence: 0.9,
      status: 'assigned',
      createdAt: oldDate,
      routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
      statusLog: [{ status: 'assigned', note: 'SLA overdue: 24h deadline exceeded. Escalated.', actor: 'system-sla', at: oldDate }],
    });

    const result = await checkSLA();
    expect(result.escalated).toBe(0);
  });

  test('skips resolved complaints', async () => {
    const dept = await Department.findOne({ jurisdictionType: 'WASA' });

    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await Complaint.create({
      trackingId: 'DHK-20261122-0004',
      category: 'water',
      description: 'No water supply',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'high',
      confidence: 0.9,
      status: 'resolved',
      createdAt: oldDate,
      routing: [{ department: dept._id, isPrimary: true, assignedBy: 'auto', reason: 'test' }],
    });

    const result = await checkSLA();
    expect(result.checked).toBe(0);
    expect(result.escalated).toBe(0);
  });
});
