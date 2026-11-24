import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app.js';
import { Complaint } from '../src/models/Complaint.js';

const trackingId = 'DHK-20261124-0099';

describe('Complaint reactions API', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Complaint.create({
      trackingId,
      category: 'road',
      description: 'Test complaint for reactions',
      area: 'Gulshan',
      urgency: 'high',
      confidence: 0.9,
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('upvote adds a vote', async () => {
    const res = await request(app)
      .post(`/api/complaints/${trackingId}/react`)
      .send({ type: 'up', action: 'add' });
    expect(res.status).toBe(200);
    expect(res.body.upvotes).toBe(1);
    expect(res.body.downvotes).toBe(0);
  });

  test('downvote adds a vote', async () => {
    const res = await request(app)
      .post(`/api/complaints/${trackingId}/react`)
      .send({ type: 'down', action: 'add' });
    expect(res.status).toBe(200);
    expect(res.body.upvotes).toBe(1);
    expect(res.body.downvotes).toBe(1);
  });

  test('remove upvote decrements count', async () => {
    const res = await request(app)
      .post(`/api/complaints/${trackingId}/react`)
      .send({ type: 'up', action: 'remove' });
    expect(res.status).toBe(200);
    expect(res.body.upvotes).toBe(0);
    expect(res.body.downvotes).toBe(1);
  });

  test('counts never go negative', async () => {
    const res = await request(app)
      .post(`/api/complaints/${trackingId}/react`)
      .send({ type: 'up', action: 'remove' });
    expect(res.status).toBe(409);
  });

  test('invalid reaction type is rejected', async () => {
    const res = await request(app)
      .post(`/api/complaints/${trackingId}/react`)
      .send({ type: 'sideways' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid/);
  });

  test('unknown complaint returns 404', async () => {
    const res = await request(app)
      .post('/api/complaints/DHK-20990101-0001/react')
      .send({ type: 'up' });
    expect(res.status).toBe(404);
  });

  test('map and track endpoints expose reaction counts', async () => {
    const map = await request(app).get('/api/complaints/map');
    expect(map.status).toBe(200);
    const marker = map.body.markers.find((m) => m.trackingId === trackingId);
    expect(marker.upvotes).toBe(0);
    expect(marker.downvotes).toBe(1);

    const track = await request(app).get(`/api/complaints/track/${trackingId}`);
    expect(track.status).toBe(200);
    expect(track.body.upvotes).toBe(0);
    expect(track.body.downvotes).toBe(1);
  });
});
