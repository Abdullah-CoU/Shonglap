import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Department } from '../models/Department.js';
import { Jurisdiction } from '../models/Jurisdiction.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', '..', 'data');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shonglap';
  await mongoose.connect(uri);
  console.log('MongoDB connected for seeding');
};

const seedDepartments = async () => {
  const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
  await Department.deleteMany({});
  const created = await Department.insertMany(departments);
  console.log(`Seeded ${created.length} departments`);
  return created;
};

const seedJurisdictions = async (departments) => {
  const jurisdictions = JSON.parse(readFileSync(join(DATA_DIR, 'jurisdictions.json'), 'utf-8'));
  await Jurisdiction.deleteMany({});

  const deptMap = {};
  for (const d of departments) {
    deptMap[d.jurisdictionType] = d._id;
    // Also map by nameEn for city corps
    if (d.nameEn === 'Dhaka North City Corporation') deptMap['DNCC'] = d._id;
    if (d.nameEn === 'Dhaka South City Corporation') deptMap['DSCC'] = d._id;
    if (d.nameEn === 'Dhaka Power Distribution Company') deptMap['DPDC'] = d._id;
    if (d.nameEn === 'Dhaka Electric Supply Company') deptMap['DESCO'] = d._id;
  }

  const entries = [];
  for (const j of jurisdictions) {
    if (j.cityCorp && deptMap[j.cityCorp]) {
      entries.push({
        department: deptMap[j.cityCorp],
        areaName: j.areaName,
        wards: j.wards,
        verified: j.verified ?? false
      });
    }
    if (j.powerZone && deptMap[j.powerZone]) {
      entries.push({
        department: deptMap[j.powerZone],
        areaName: j.areaName,
        wards: j.wards,
        verified: j.verified ?? false
      });
    }
  }

  const created = await Jurisdiction.insertMany(entries);
  console.log(`Seeded ${created.length} jurisdictions`);
};

const seedUsers = async (departments) => {
  const deptMap = {};
  for (const d of departments) {
    deptMap[d.jurisdictionType] = d._id;
  }

  await User.deleteMany({});

  const adminPw = await hashPassword('admin123');
  const deptPw = await hashPassword('dept123');

  const users = [
    { name: 'Admin User', email: 'admin@shonglap.gov.bd', passwordHash: adminPw.hash, salt: adminPw.salt, role: 'admin', department: null },
    { name: 'DNCC Officer', email: 'dncc@shonglap.gov.bd', passwordHash: deptPw.hash, salt: deptPw.salt, role: 'department', department: deptMap['DNCC'] },
    { name: 'DSCC Officer', email: 'dscc@shonglap.gov.bd', passwordHash: deptPw.hash, salt: deptPw.salt, role: 'department', department: deptMap['DSCC'] },
    { name: 'WASA Officer', email: 'wasa@shonglap.gov.bd', passwordHash: deptPw.hash, salt: deptPw.salt, role: 'department', department: deptMap['WASA'] },
  ];

  const created = await User.insertMany(users);
  console.log(`Seeded ${created.length} demo users`);
  console.log('Demo accounts: admin@shonglap.gov.bd / admin123, dncc@shonglap.gov.bd / dept123, etc.');
};

const seed = async () => {
  try {
    await connectDB();
    const departments = await seedDepartments();
    await seedJurisdictions(departments);
    await seedUsers(departments);
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seed();
