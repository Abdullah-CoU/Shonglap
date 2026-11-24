import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import app from '../src/app.js';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';
import { resolveLandmark, resolveComplaintLocation } from '../src/services/geocode.js';
import { segmentComplaint } from '../src/services/segmentation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Landmark gazetteer', () => {
  test('finds a bus stop from English text', () => {
    const hit = resolveLandmark('There is a huge pothole near Farmgate bus stop');
    expect(hit).not.toBeNull();
    expect(hit.area).toBe('Tejgaon');
    expect(hit.type).toBe('bus_stop');
    expect(hit.confidence).toBeGreaterThanOrEqual(0.58);
  });

  test('finds a landmark from Bangla text', () => {
    const hit = resolveLandmark('মিরপুর ১০ বাসস্ট্যান্ডের কাছে পানি নেই');
    expect(hit).not.toBeNull();
    expect(hit.area).toBe('Mirpur');
  });

  test('finds Jigatola bus stand from the reported complaint text', () => {
    const text = 'জিগাতলা বাস স্ট্যান্ডের পাশে এখানে ময়লার যে ডাস্টবিনটা আছে সেখান থেকে অনেক বেশি দুর্গন্ধ ছড়াচ্ছে আমাদের বাসায় থাকা যাচ্ছে না।';
    const hit = resolveLandmark(text);
    expect(hit).not.toBeNull();
    expect(hit.area).toBe('Dhanmondi');
    expect(hit.landmark).toBe('Jigatola Bus Stand');
  });

  test('Kolatali is not confused with the similar-looking Jigatola', () => {
    const text = 'কলাতলীর দিকে যাচ্ছে যে খেলার মাঠের কাছে এখানে একটা স্ট্রিট লাইট ভাঙ্গা।';
    const hit = resolveLandmark(text);
    expect(hit?.landmark).toBe('Kolatali Playground');
    expect(hit?.landmark).not.toBe('Jigatola Bus Stand');
  });

  test('new bus stands and markets are recognized', () => {
    expect(resolveLandmark('করওয়ান বাজারের কাছে গর্ত')?.area).toBe('Tejgaon');
    expect(resolveLandmark('পল্টন বাস স্ট্যান্ডে ট্রাফিক')?.area).toBe('Motijheel');
    expect(resolveLandmark('নিকুঞ্জ বাস স্ট্যান্ডের পাশে ময়লা')?.area).toBe('Uttara');
  });

  test('finds a shop/market name', () => {
    const hit = resolveLandmark('gate broken at Uttara Rajuk Market');
    expect(hit?.area).toBe('Uttara');
  });

  test('tolerates a voice-ASR typo', () => {
    const hit = resolveLandmark('road problem at Farmget');
    expect(hit?.area).toBe('Tejgaon');
  });

  test('returns null for unknown landmarks', () => {
    expect(resolveLandmark('somewhere in the city')).toBeNull();
  });

  test('enrichment sets area and removes missing-area flag', () => {
    const result = resolveComplaintLocation(
      { category: 'road', description: 'pothole near Farmgate', missingFields: ['area'] },
      {}
    );
    expect(result.extracted.area).toBe('Tejgaon');
    expect(result.extracted.locationSource).toBe('landmark');
    expect(result.extracted.missingFields).not.toContain('area');
    expect(result.location.lat).toBeGreaterThan(0);
  });

  test('explicit area is not overridden by a landmark', () => {
    const result = resolveComplaintLocation(
      { area: 'Gulshan', description: 'near Farmgate', missingFields: [] },
      {}
    );
    expect(result.extracted.area).toBe('Gulshan');
    expect(result.extracted.locationSource).toBe('area');
    expect(result.extracted.matchedLandmark).toBe('Farmgate Bus Terminal');
  });
});

describe('Landmark-based routing API', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const jurisdictions = JSON.parse(readFileSync(join(DATA_DIR, 'jurisdictions.json'), 'utf-8'));
    const deptDocs = await Department.insertMany(departments);
    const byType = Object.fromEntries(deptDocs.map((d) => [d.jurisdictionType, d._id]));
    await Jurisdiction.insertMany(jurisdictions.map((j) => ({
      areaName: j.areaName,
      wards: j.wards || [],
      department: byType[j.cityCorp] || byType['DNCC'],
      verified: j.verified ?? true,
    })));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('draft without an area resolves city corporation from a bus stop', async () => {
    const res = await request(app).post('/api/complaints/draft').send({
      text: 'Road pothole near Shapla Square bus stop',
      language: 'en',
    });
    expect(res.status).toBe(201);
    expect(res.body.extracted.area).toBe('Motijheel');
    expect(res.body.extracted.missingFields).not.toContain('area');
    expect(res.body.extracted.locationSource).toBe('landmark');
    // Motijheel is DSCC in our jurisdiction data
    expect(String(res.body.routing.primary?.nameEn || '')).toContain('South');
  });

  test('Bangla street light wording is classified as streetlight', async () => {
    const parts = await segmentComplaint({
      text: 'কলাতলীর খেলার মাঠের কাছে স্ট্রিট লাইট ভাঙ্গা।',
      extracted: { category: 'road', urgency: 'medium', area: 'Dhanmondi' },
    });
    expect(parts[0]?.category).toBe('streetlight');
  });

  test('each problem uses its own landmark for routing', async () => {
    const parts = await segmentComplaint({
      text: 'Pothole near Farmgate bus stand. Garbage pile near Shapla Square.',
      extracted: { category: 'road', urgency: 'medium', area: '' },
    });
    expect(parts).toHaveLength(2);
    const farmgate = parts.find((p) => p.landmark === 'Farmgate Bus Terminal');
    const shapla = parts.find((p) => p.landmark === 'Shapla Square');
    expect(farmgate).toBeTruthy();
    expect(shapla).toBeTruthy();
    const deptDocs = await Department.find({}).select('_id jurisdictionType').lean();
    const map = Object.fromEntries(deptDocs.map((d) => [d._id.toString(), d.jurisdictionType]));
    expect(map[farmgate.departmentId]).toBe('DNCC');
    expect(map[shapla.departmentId]).toBe('DSCC');
  });

  test('farmgate landmark routes to DNCC', async () => {
    const res = await request(app).post('/api/complaints/draft').send({
      text: 'Garbage pile near Farmgate bus stand',
      language: 'en',
    });
    expect(res.status).toBe(201);
    expect(res.body.extracted.area).toBe('Tejgaon');
    expect(String(res.body.routing.primary?.nameEn || '')).toContain('North');
  });
});
