import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';
import { extractComplaint } from '../src/services/extraction.js';
import { routeComplaint } from '../src/services/routing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

describe('Routing Service Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Seed departments and jurisdictions
    const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
    const depts = await Department.insertMany(departments);

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

  test('should route a water complaint to WASA', async () => {
    const extracted = await extractComplaint({ text: 'No water supply in Mirpur 6 for 2 days.' });
    const routing = await routeComplaint(extracted, null);
    expect(routing.primaryDepartmentId).toBeTruthy();
    const dept = await Department.findById(routing.primaryDepartmentId);
    expect(dept.jurisdictionType).toBe('WASA');
  });

  test('should route electricity to correct power company based on area', async () => {
    const extracted = await extractComplaint({ text: 'Electricity outage in Uttara sector 4 for 6 hours.' });
    const routing = await routeComplaint(extracted, null);
    expect(routing.primaryDepartmentId).toBeTruthy();
    const dept = await Department.findById(routing.primaryDepartmentId);
    expect(dept.jurisdictionType).toBe('DESCO'); // Uttara -> DESCO
  });

  test('should route road complaint in Dhanmondi to DSCC', async () => {
    const extracted = await extractComplaint({ text: 'There is a huge pothole on Dhanmondi Road 27 causing traffic jam.' });
    const routing = await routeComplaint(extracted, null);
    expect(routing.primaryDepartmentId).toBeTruthy();
    const dept = await Department.findById(routing.primaryDepartmentId);
    expect(dept.jurisdictionType).toBe('DSCC');
  });

  test('should route gas leak as critical and triage if low confidence', async () => {
    const extracted = await extractComplaint({ text: 'Gas leak smell in Mohammadpur kitchen, emergency.' });
    const routing = await routeComplaint(extracted, null);
    expect(routing.primaryDepartmentId).toBeTruthy();
    const dept = await Department.findById(routing.primaryDepartmentId);
    expect(dept.jurisdictionType).toBe('Titas');
  });

  test('should triage spam', async () => {
    const extracted = await extractComplaint({ text: 'Win lottery 1 million taka call now' });
    const routing = await routeComplaint(extracted, null);
    expect(routing.needsTriage).toBe(true);
    expect(routing.method).toBe('triage');
  });

  test('waterlogging should route to WASA primary with city corp secondary', async () => {
    const extracted = await extractComplaint({ text: 'Waterlogging in Mirpur 10 after rain, knee deep water.' });
    const routing = await routeComplaint(extracted, null);
    expect(routing.primaryDepartmentId).toBeTruthy();
    const primary = await Department.findById(routing.primaryDepartmentId);
    expect(primary.jurisdictionType).toBe('WASA');
    expect(routing.secondaryDepartmentIds.length).toBeGreaterThan(0);
  });

  test('should return valid RoutingDecision structure', async () => {
    const extracted = await extractComplaint({ text: 'Garbage pile in Gulshan.' });
    const routing = await routeComplaint(extracted, null);
    expect(routing).toHaveProperty('primaryDepartmentId');
    expect(routing).toHaveProperty('secondaryDepartmentIds');
    expect(routing).toHaveProperty('confidence');
    expect(routing).toHaveProperty('method');
    expect(routing).toHaveProperty('reasoning');
    expect(routing).toHaveProperty('needsTriage');
    expect(['rule', 'llm', 'triage']).toContain(routing.method);
    expect(routing.confidence).toBeGreaterThanOrEqual(0);
    expect(routing.confidence).toBeLessThanOrEqual(1);
  });
});
