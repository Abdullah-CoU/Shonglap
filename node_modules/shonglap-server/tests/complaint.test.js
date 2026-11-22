import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';

describe('Shonglap Complaint & Health API Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Complaint.deleteMany({});
  });

  test('GET /api/health should return status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('shonglap-server');
  });

  test('Should create and read a Complaint using Mongoose model', async () => {
    const mockDepartmentId = new mongoose.Types.ObjectId();

    const complaintData = {
      trackingId: 'DHK-20261122-0001',
      category: 'road',
      description: 'Huge pothole on Gulshan Avenue causing traffic jam.',
      descriptionBn: 'গুলশান এভিনিউতে বড় গর্তের কারণে যানজট।',
      area: 'Gulshan',
      ward: 18,
      landmark: 'Near Agora',
      urgency: 'high',
      confidence: 0.95,
      contactPhone: '+8801711122334',
      language: 'en',
      routing: [{
        department: mockDepartmentId,
        isPrimary: true,
        assignedBy: 'auto',
        reason: 'Matched department keyword and jurisdiction.'
      }]
    };

    const created = await Complaint.create(complaintData);
    expect(created._id).toBeDefined();
    expect(created.trackingId).toBe('DHK-20261122-0001');
    expect(created.urgency).toBe('high');

    const fetched = await Complaint.findOne({ trackingId: 'DHK-20261122-0001' });
    expect(fetched).not.toBeNull();
    expect(fetched.description).toBe(complaintData.description);
    expect(fetched.routing.length).toBe(1);
    expect(fetched.routing[0].department.toString()).toBe(mockDepartmentId.toString());
  });
});
