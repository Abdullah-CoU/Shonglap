import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';
import { generateReport } from '../src/services/report.js';

describe('Report Service Tests', () => {
  test('generateReport builds minimal JSON and formal report', () => {
    const complaint = {
      trackingId: 'DHK-20261122-0001',
      category: 'water',
      description: 'Water supply issue',
      area: 'Dhanmondi',
      ward: 14,
      urgency: 'high',
      status: 'assigned',
      createdAt: new Date('2026-11-22T10:00:00Z'),
      routing: [{ isPrimary: true, department: { nameEn: 'Dhaka WASA' } }],
    };
    const result = generateReport(complaint);
    expect(result.ok).toBe(true);
    expect(result.json.trackingId).toBe('DHK-20261122-0001');
    expect(result.json.area).toBe('Dhanmondi');
    expect(result.json.department).toBe('Dhaka WASA');
    expect(result.formal).toContain('Dhaka WASA');
    expect(result.formal).toContain('Ref: DHK-20261122-0001');
  });

  test('generateReport returns missing area when absent', () => {
    const result = generateReport({
      trackingId: 'DHK-20261122-0002', category: 'road', description: 'pothole',
      area: '', urgency: 'high', status: 'triage', createdAt: new Date(), routing: [],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['area']);
    expect(result.json).toBeNull();
  });

  describe('API', () => {
    let mongoServer;
    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      await mongoose.connect(mongoServer.getUri());
      await Complaint.create({
        trackingId: 'DHK-20261122-0003', category: 'road', description: 'Pothole',
        area: 'Mirpur', ward: 5, urgency: 'high', status: 'assigned', confidence: 0.9,
        location: { type: 'Point', coordinates: [90.36, 23.81] },
        createdAt: new Date(), routing: [],
      });
    });
    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    test('GET /api/complaints/:id/report returns json + formal', async () => {
      const res = await request(app).get('/api/complaints/DHK-20261122-0003/report');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.json.area).toBe('Mirpur');
      expect(res.body.formal).toContain('Pothole');
    });

    test('GET report for unknown ID returns 404', async () => {
      const res = await request(app).get('/api/complaints/UNKNOWN/report');
      expect(res.status).toBe(404);
    });
  });
});
