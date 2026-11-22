import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Seed Data Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('Should seed departments from JSON', async () => {
    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    await Department.deleteMany({});
    const created = await Department.insertMany(departments);
    expect(created.length).toBe(12);

    const found = await Department.find({});
    expect(found.length).toBe(12);

    // Verify all have required fields
    for (const d of found) {
      expect(d.nameEn).toBeTruthy();
      expect(d.nameBn).toBeTruthy();
      expect(d.email).toBeTruthy();
      expect(d.responsibilities).toBeTruthy();
      expect(d.keywords.length).toBeGreaterThanOrEqual(15);
      expect(d.jurisdictionType).toBeTruthy();
    }
  });

  test('Should seed jurisdictions from JSON', async () => {
    const departments = await Department.find({});
    const deptMap = {};
    for (const d of departments) {
      deptMap[d.jurisdictionType] = d._id;
      if (d.nameEn === 'Dhaka North City Corporation') deptMap['DNCC'] = d._id;
      if (d.nameEn === 'Dhaka South City Corporation') deptMap['DSCC'] = d._id;
      if (d.nameEn === 'Dhaka Power Distribution Company') deptMap['DPDC'] = d._id;
      if (d.nameEn === 'Dhaka Electric Supply Company') deptMap['DESCO'] = d._id;
    }

    const jurisdictions = JSON.parse(readFileSync(join(DATA_DIR, 'jurisdictions.json'), 'utf-8'));
    await Jurisdiction.deleteMany({});

    const entries = [];
    for (const j of jurisdictions) {
      if (j.cityCorp && deptMap[j.cityCorp]) {
        entries.push({ department: deptMap[j.cityCorp], areaName: j.areaName, wards: j.wards, verified: j.verified ?? false });
      }
      if (j.powerZone && deptMap[j.powerZone]) {
        entries.push({ department: deptMap[j.powerZone], areaName: j.areaName, wards: j.wards, verified: j.verified ?? false });
      }
    }

    const created = await Jurisdiction.insertMany(entries);
    expect(created.length).toBeGreaterThan(0);

    // All should be unverified
    const all = await Jurisdiction.find({});
    for (const j of all) {
      expect(j.verified).toBe(false);
    }
  });

  test('Sample complaints JSON should be valid', async () => {
    const samples = JSON.parse(readFileSync(join(DATA_DIR, 'sample_complaints.json'), 'utf-8'));
    expect(samples.length).toBeGreaterThanOrEqual(40);
    for (const s of samples) {
      expect(s.text).toBeTruthy();
      expect(s.expectedCategory).toBeTruthy();
      expect(s.expectedPrimary).toBeTruthy();
      expect(s.expectedUrgency).toBeTruthy();
    }
  });
});
