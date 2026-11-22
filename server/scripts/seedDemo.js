import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';
import { Complaint } from '../src/models/Complaint.js';
import { User } from '../src/models/User.js';
import bcrypt from 'bcrypt';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shonglap';
  await mongoose.connect(uri);
};

const AREAS = ['Gulshan', 'Banani', 'Dhanmondi', 'Uttara', 'Mirpur', 'Motijheel', 'Old Dhaka', 'Jatrabari', 'Mohammadpur', 'Tejgaon', 'Badda', 'Rampura'];
const CATEGORIES = ['road', 'garbage', 'mosquito', 'streetlight', 'water', 'electricity', 'gas', 'construction', 'traffic', 'pollution', 'noise'];
const URGENCIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['received', 'assigned', 'in_progress', 'resolved', 'triage'];
const DESCRIPTIONS = {
  road: ['Large pothole on main road', 'Road surface cracked', 'Footpath broken', 'Lane flooded after rain'],
  garbage: ['Garbage pile not collected', 'Dustbin overflowing', 'Waste on road'],
  mosquito: ['Mosquito breeding in stagnant water', 'Dengue fear in area', 'Need fogging'],
  streetlight: ['Street light not working', 'Broken lamp post', 'Dark street at night'],
  water: ['No water supply', 'Low water pressure', 'Dirty water from tap'],
  electricity: ['Power outage', 'Hanging wire', 'Transformer issue'],
  gas: ['Gas leak smell', 'No gas supply', 'Low gas pressure'],
  construction: ['Illegal construction', 'Building without permit', 'Encroachment on road'],
  traffic: ['Traffic jam', 'Signal broken', 'Illegal parking'],
  pollution: ['Factory smoke', 'Air pollution', 'Noise from factory'],
  noise: ['Loud noise at night', 'Construction noise', 'Generator noise'],
};

const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateComplaint = (i, departments, deptMap) => {
  const category = randomFrom(CATEGORIES);
  const area = randomFrom(AREAS);
  const urgency = randomFrom(URGENCIES);
  const status = randomFrom(STATUSES);
  const description = randomFrom(DESCRIPTIONS[category] || ['General complaint']);
  const isSpam = Math.random() < 0.05;
  const actualCategory = isSpam ? 'spam' : category;

  // Pick department based on category
  let deptType = 'DNCC';
  if (['water', 'sewerage', 'waterlogging'].includes(actualCategory)) deptType = 'WASA';
  else if (['electricity'].includes(actualCategory)) deptType = Math.random() > 0.5 ? 'DESCO' : 'DPDC';
  else if (['gas'].includes(actualCategory)) deptType = 'Titas';
  else if (['construction'].includes(actualCategory)) deptType = 'RAJUK';
  else if (['crime'].includes(actualCategory)) deptType = 'Police';
  else if (['traffic'].includes(actualCategory)) deptType = 'Traffic';
  else if (['fire'].includes(actualCategory)) deptType = 'Fire';
  else if (['pollution', 'noise'].includes(actualCategory)) deptType = 'DOE';
  else if (['road', 'garbage', 'mosquito', 'streetlight'].includes(actualCategory)) {
    deptType = ['DNCC', 'DSCC'][Math.floor(Math.random() * 2)];
  }

  const deptId = deptMap[deptType] || departments[0]._id;

  const daysAgo = randomInt(0, 30);
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  const lat = 23.7 + Math.random() * 0.2;
  const lng = 90.35 + Math.random() * 0.15;

  return {
    trackingId: `DHK-${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(i + 1).padStart(4, '0')}`,
    rawText: description,
    transcript: '',
    category: actualCategory,
    description,
    descriptionBn: '',
    area,
    ward: randomInt(1, 50),
    landmark: `Near ${area} center`,
    location: { type: 'Point', coordinates: [lng, lat] },
    urgency: isSpam ? 'low' : urgency,
    status: isSpam ? 'triage' : status,
    confidence: isSpam ? 0.3 : 0.7 + Math.random() * 0.3,
    contactPhone: Math.random() > 0.5 ? `01${randomInt(7, 9)}${randomInt(10000000, 99999999)}` : '',
    contactEmail: Math.random() > 0.7 ? `citizen${i}@example.com` : '',
    language: randomFrom(['bn', 'en', 'banglish']),
    supporters: randomInt(0, 5),
    attachments: Math.random() > 0.6 ? [{ type: 'photo', path: `/uploads/demo_${i}.jpg`, meta: {} }] : [],
    routing: [{ department: deptId, isPrimary: true, assignedBy: 'auto', reason: 'Demo seed' }],
    statusLog: [{ status: isSpam ? 'triage' : status, note: 'Demo complaint', actor: 'system', at: createdAt }],
    createdAt,
    updatedAt: createdAt,
  };
};

const main = async () => {
  await connectDB();

  // Seed departments and jurisdictions
  const departments = JSON.parse(readFileSync(join(DATA_DIR, 'departments.json'), 'utf-8'));
  await Department.deleteMany({});
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
  await Jurisdiction.deleteMany({});
  const entries = [];
  for (const j of jurisdictions) {
    if (j.cityCorp && deptMap[j.cityCorp]) entries.push({ department: deptMap[j.cityCorp], areaName: j.areaName, wards: j.wards, verified: false });
    if (j.powerZone && deptMap[j.powerZone]) entries.push({ department: deptMap[j.powerZone], areaName: j.areaName, wards: j.wards, verified: false });
  }
  await Jurisdiction.insertMany(entries);

  // Seed demo users
  await User.deleteMany({});
  const adminHash = await bcrypt.hash('admin123', 10);
  const deptHash = await bcrypt.hash('dept123', 10);
  await User.insertMany([
    { name: 'Admin User', email: 'admin@shonglap.gov.bd', passwordHash: adminHash, role: 'admin', department: null },
    { name: 'DNCC Officer', email: 'dncc@shonglap.gov.bd', passwordHash: deptHash, role: 'department', department: deptMap['DNCC'] },
    { name: 'DSCC Officer', email: 'dscc@shonglap.gov.bd', passwordHash: deptHash, role: 'department', department: deptMap['DSCC'] },
    { name: 'WASA Officer', email: 'wasa@shonglap.gov.bd', passwordHash: deptHash, role: 'department', department: deptMap['WASA'] },
  ]);

  // Generate 50 complaints
  await Complaint.deleteMany({});
  const complaints = [];
  for (let i = 0; i < 50; i++) {
    complaints.push(generateComplaint(i, depts, deptMap));
  }
  await Complaint.insertMany(complaints);

  console.log('Demo seed complete: 50 complaints, 4 users, 12 departments, 56 jurisdictions');
  process.exit(0);
};

main().catch((e) => { console.error(e); process.exit(1); });
