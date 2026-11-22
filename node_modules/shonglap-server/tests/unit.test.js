import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { z } from 'zod';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';
import { Complaint } from '../src/models/Complaint.js';
import { extractedComplaintSchema } from '../src/services/extraction.js';
import { routingSchema } from '../src/services/routing.js';
import { findDuplicates, addSupporter } from '../src/services/duplicate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Unit Tests: Zod Schemas', () => {
  test('extractedComplaintSchema validates valid data', () => {
    const valid = {
      category: 'road',
      description: 'Pothole on road',
      descriptionBn: '',
      area: 'Dhanmondi',
      landmark: '',
      ward: 14,
      urgency: 'high',
      urgencyReason: 'Traffic hazard',
      languageDetected: 'en',
      missingFields: [],
      isSpam: false,
      contactPhone: '',
      contactEmail: '',
    };
    const result = extractedComplaintSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test('extractedComplaintSchema rejects invalid category', () => {
    const invalid = { category: 'invalid_category', description: 'test' };
    const result = extractedComplaintSchema.safeParse(invalid);
    // Should catch to default 'spam' due to .catch()
    expect(result.success).toBe(true);
    expect(result.data.category).toBe('spam');
  });

  test('extractedComplaintSchema handles missing fields with defaults', () => {
    const minimal = {};
    const result = extractedComplaintSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    expect(result.data.category).toBe('spam');
    expect(result.data.urgency).toBe('medium');
    expect(result.data.isSpam).toBe(false);
  });

  test('routingSchema validates valid data', () => {
    const valid = { primary: '507f1f77bcf86cd799439011', secondary: [], confidence: 0.9, reasoning: 'test' };
    const result = routingSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test('routingSchema rejects invalid confidence', () => {
    const invalid = { primary: '507f1f77bcf86cd799439011', confidence: 1.5 };
    const result = routingSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test('routingSchema defaults secondary to empty array', () => {
    const minimal = { primary: '507f1f77bcf86cd799439011' };
    const result = routingSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    expect(result.data.secondary).toEqual([]);
  });
});

describe('Unit Tests: Rule Layer & Jurisdiction', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    await Department.insertMany(departments);

    // Create jurisdictions
    const depts = await Department.find({}).lean();
    const deptMap = {};
    for (const d of depts) {
      deptMap[d.jurisdictionType] = d._id;
      if (d.nameEn === 'Dhaka North City Corporation') deptMap['DNCC'] = d._id;
      if (d.nameEn === 'Dhaka South City Corporation') deptMap['DSCC'] = d._id;
      if (d.nameEn === 'Dhaka Power Distribution Company') deptMap['DPDC'] = d._id;
      if (d.nameEn === 'Dhaka Electric Supply Company') deptMap['DESCO'] = d._id;
    }

    const jurisdictions = JSON.parse(readFileSync(join(DATA_DIR, 'jurisdictions.json'), 'utf-8'));
    const entries = [];
    for (const j of jurisdictions) {
      if (j.cityCorp && deptMap[j.cityCorp]) {
        entries.push({ department: deptMap[j.cityCorp], areaName: j.areaName, wards: j.wards, verified: false });
      }
      if (j.powerZone && deptMap[j.powerZone]) {
        entries.push({ department: deptMap[j.powerZone], areaName: j.areaName, wards: j.wards, verified: false });
      }
    }
    await Jurisdiction.insertMany(entries);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('jurisdiction lookup resolves DNCC for Gulshan', async () => {
    const j = await Jurisdiction.findOne({ areaName: 'Gulshan' }).populate('department').lean();
    expect(j).toBeTruthy();
    const cityCorp = await Jurisdiction.findOne({
      areaName: 'Gulshan',
      department: { $in: (await Department.find({ jurisdictionType: { $in: ['DNCC', 'DSCC'] } }).distinct('_id')) },
    }).populate('department').lean();
    // At least one jurisdiction entry for Gulshan
    const all = await Jurisdiction.find({ areaName: 'Gulshan' }).populate('department').lean();
    expect(all.length).toBeGreaterThan(0);
    const dncc = all.find((j) => j.department?.jurisdictionType === 'DNCC');
    expect(dncc).toBeTruthy();
  });

  test('jurisdiction lookup resolves DSCC for Dhanmondi', async () => {
    const all = await Jurisdiction.find({ areaName: 'Dhanmondi' }).populate('department').lean();
    const dscc = all.find((j) => j.department?.jurisdictionType === 'DSCC');
    expect(dscc).toBeTruthy();
  });

  test('jurisdiction lookup resolves DESCO for Uttara', async () => {
    const all = await Jurisdiction.find({ areaName: 'Uttara' }).populate('department').lean();
    const desco = all.find((j) => j.department?.jurisdictionType === 'DESCO');
    expect(desco).toBeTruthy();
  });

  test('all jurisdictions are unverified (TODO)', async () => {
    const all = await Jurisdiction.find({}).lean();
    for (const j of all) {
      expect(j.verified).toBe(false);
    }
  });

  test('duplicate detection service exists and works', async () => {
    // Create a complaint
    await Complaint.create({
      trackingId: 'DHK-20261122-9999',
      category: 'road',
      description: 'Test pothole',
      area: 'Dhanmondi',
      location: { type: 'Point', coordinates: [90.37, 23.75] },
      urgency: 'medium',
      confidence: 0.9,
      status: 'received',
    });

    await Complaint.ensureIndexes();
    const dups = await findDuplicates({ lat: 23.75, lng: 90.37, category: 'road', area: 'Dhanmondi' });
    expect(dups.length).toBeGreaterThan(0);

    const updated = await addSupporter('DHK-20261122-9999');
    expect(updated.supporters).toBe(1);
  });
});

describe('Unit Tests: Complaint Model', () => {
  test('Complaint schema has required fields', () => {
    const paths = Complaint.schema.paths;
    expect(paths.trackingId).toBeDefined();
    expect(paths.category).toBeDefined();
    expect(paths['location.coordinates']).toBeDefined();
    expect(paths.status).toBeDefined();
    expect(paths.routing).toBeDefined();
    expect(paths.statusLog).toBeDefined();
  });

  test('Complaint location has 2dsphere index', () => {
    const indexes = Complaint.schema.indexes();
    const hasGeoIndex = indexes.some((idx) => JSON.stringify(idx[0]).includes('2dsphere') || (idx[1] && idx[1].type === '2dsphere'));
    // Check if location index exists
    const locationIndex = indexes.find((idx) => idx[0] && idx[0].location === '2dsphere');
    expect(locationIndex).toBeTruthy();
  });
});
