import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Department } from './models/Department.js';
import { Jurisdiction } from './models/Jurisdiction.js';
import { User } from './models/User.js';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

const ms = await MongoMemoryServer.create();
const uri = ms.getUri();
process.env.MONGODB_URI = uri;
await mongoose.connect(uri);
logger.info(`In-memory MongoDB started at ${uri}`);

// Seed
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
  if (j.cityCorp && deptMap[j.cityCorp]) entries.push({ department: deptMap[j.cityCorp], areaName: j.areaName, wards: j.wards, verified: false });
  if (j.powerZone && deptMap[j.powerZone]) entries.push({ department: deptMap[j.powerZone], areaName: j.areaName, wards: j.wards, verified: false });
}
await Jurisdiction.insertMany(entries);

// Demo users
const adminHash = await bcrypt.hash('admin123', 10);
const deptHash = await bcrypt.hash('dept123', 10);
await User.insertMany([
  { name: 'Admin User', email: 'admin@shonglap.gov.bd', passwordHash: adminHash, role: 'admin', department: null },
  { name: 'DNCC Officer', email: 'dncc@shonglap.gov.bd', passwordHash: deptHash, role: 'department', department: deptMap['DNCC'] },
]);
logger.info('Seeded demo data');

const PORT = env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Shonglap server running on port ${PORT} (in-memory DB)`);
});

process.on('SIGINT', async () => {
  await ms.stop();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await ms.stop();
  process.exit(0);
});
