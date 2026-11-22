import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Department } from '../src/models/Department.js';
import { Jurisdiction } from '../src/models/Jurisdiction.js';
import { extractComplaint } from '../src/services/extraction.js';
import { routeComplaint } from '../src/services/routing.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', 'data');

const PRIMARY_TO_JURISDICTION = {
  DNCC: 'DNCC', DSCC: 'DSCC', WASA: 'WASA', DPDC: 'DPDC', DESCO: 'DESCO',
  Titas: 'Titas', RAJUK: 'RAJUK', RHD: 'RHD', DMP: 'Police', Traffic: 'Traffic',
  Fire: 'Fire', DOE: 'DOE', triage: null,
};

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shonglap';
  await mongoose.connect(uri);
};

const main = async () => {
  await connectDB();

  const departments = await Department.find({}).lean();
  const deptByJurisdiction = {};
  for (const d of departments) deptByJurisdiction[d.jurisdictionType] = d._id.toString();

  const samples = JSON.parse(readFileSync(join(DATA_DIR, 'sample_complaints.json'), 'utf-8'));

  // Stats
  let total = 0;
  let correct = 0;
  let autoRouted = 0;
  let triaged = 0;
  const misrouted = [];
  const confusion = {}; // expected -> got -> count
  const categoryStats = { correct: 0, total: 0 };
  const areaStats = { correct: 0, total: 0 };

  // With photo vs without photo
  let withPhotoCorrect = 0, withPhotoTotal = 0;
  let withoutPhotoCorrect = 0, withoutPhotoTotal = 0;

  for (const sample of samples) {
    total++;
    const extracted = await extractComplaint({ text: sample.text });
    const routing = await routeComplaint(extracted, null);

    // Category accuracy
    categoryStats.total++;
    if (extracted.category === sample.expectedCategory) categoryStats.correct++;

    // Area accuracy (check if area was detected)
    if (sample.text.match(/Gulshan|Mirpur|Dhanmondi|Uttara|Motijheel|Jatrabari|Mohammadpur/i)) {
      areaStats.total++;
      const expectedArea = sample.text.match(/Gulshan|Mirpur|Dhanmondi|Uttara|Motijheel|Jatrabari|Mohammadpur/i)?.[0];
      if (extracted.area && expectedArea && extracted.area.toLowerCase().includes(expectedArea.toLowerCase())) {
        areaStats.correct++;
      }
    }

    const expectedPrimary = sample.expectedPrimary;
    let expectedDeptId = null;
    if (expectedPrimary !== 'triage') {
      const jt = PRIMARY_TO_JURISDICTION[expectedPrimary];
      expectedDeptId = jt ? deptByJurisdiction[jt] : null;
    }

    const gotDeptId = routing.primaryDepartmentId;
    const gotDept = departments.find((d) => d._id.toString() === gotDeptId);
    const gotLabel = gotDept ? gotDept.jurisdictionType : (routing.needsTriage ? 'triage' : 'none');

    const isCorrect = expectedPrimary === 'triage' ? routing.needsTriage : gotDeptId === expectedDeptId;

    if (isCorrect) correct++;
    if (!routing.needsTriage) autoRouted++;
    if (routing.needsTriage) triaged++;

    // Confusion matrix
    if (!confusion[expectedPrimary]) confusion[expectedPrimary] = {};
    confusion[expectedPrimary][gotLabel] = (confusion[expectedPrimary][gotLabel] || 0) + 1;

    // With/without photo (simulate: samples with "photo" in text vs without)
    const hasPhoto = sample.text.toLowerCase().includes('photo') || sample.text.toLowerCase().includes('ছবি');
    if (hasPhoto) {
      withPhotoTotal++;
      if (isCorrect) withPhotoCorrect++;
    } else {
      withoutPhotoTotal++;
      if (isCorrect) withoutPhotoCorrect++;
    }

    if (!isCorrect) {
      misrouted.push({
        text: sample.text,
        expected: expectedPrimary,
        got: gotLabel,
        method: routing.method,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
      });
    }
  }

  // Build markdown report
  const report = [];
  report.push('# Shonglap Routing Evaluation Report');
  report.push('');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('');
  report.push('## Summary');
  report.push('');
  report.push(`| Metric | Value |`);
  report.push(`|--------|-------|`);
  report.push(`| Total samples | ${total} |`);
  report.push(`| Correct | ${correct} (${((correct / total) * 100).toFixed(1)}%) |`);
  report.push(`| Auto-routed | ${autoRouted} (${((autoRouted / total) * 100).toFixed(1)}%) |`);
  report.push(`| Triaged | ${triaged} (${((triaged / total) * 100).toFixed(1)}%) |`);
  report.push(`| Misrouted | ${misrouted.length} |`);
  report.push('');

  report.push('## Extraction Accuracy');
  report.push('');
  report.push(`| Metric | Correct | Total | Accuracy |`);
  report.push(`|--------|---------|-------|----------|`);
  report.push(`| Category | ${categoryStats.correct} | ${categoryStats.total} | ${((categoryStats.correct / categoryStats.total) * 100).toFixed(1)}% |`);
  if (areaStats.total > 0) {
    report.push(`| Area | ${areaStats.correct} | ${areaStats.total} | ${((areaStats.correct / areaStats.total) * 100).toFixed(1)}% |`);
  }
  report.push('');

  report.push('## With vs Without Photo');
  report.push('');
  report.push(`| Condition | Correct | Total | Accuracy |`);
  report.push(`|-----------|---------|-------|----------|`);
  report.push(`| With photo mention | ${withPhotoCorrect} | ${withPhotoTotal} | ${withPhotoTotal > 0 ? ((withPhotoCorrect / withPhotoTotal) * 100).toFixed(1) : 0}% |`);
  report.push(`| Without photo mention | ${withoutPhotoCorrect} | ${withoutPhotoTotal} | ${withoutPhotoTotal > 0 ? ((withoutPhotoCorrect / withoutPhotoTotal) * 100).toFixed(1) : 0}% |`);
  report.push('');

  report.push('## Confusion Matrix (Expected → Got)');
  report.push('');
  const allLabels = [...new Set([...Object.keys(confusion), ...Object.values(confusion).flatMap((v) => Object.keys(v))])];
  report.push('| Expected \\ Got | ' + allLabels.join(' | ') + ' |');
  report.push('|' + '---|'.repeat(allLabels.length + 1));
  for (const exp of Object.keys(confusion).sort()) {
    const row = [exp];
    for (const got of allLabels) {
      row.push(String(confusion[exp][got] || 0));
    }
    report.push('| ' + row.join(' | ') + ' |');
  }
  report.push('');

  if (misrouted.length > 0) {
    report.push('## Misrouted Cases');
    report.push('');
    for (const m of misrouted) {
      report.push(`### ${m.text.substring(0, 60)}`);
      report.push(`- **Expected:** ${m.expected} | **Got:** ${m.got}`);
      report.push(`- **Method:** ${m.method} | **Confidence:** ${m.confidence}`);
      report.push(`- **Reasoning:** ${m.reasoning}`);
      report.push('');
    }
  }

  const md = report.join('\n');
  console.log(md);

  // Write to file
  const outPath = join(DATA_DIR, '..', 'eval_report.md');
  writeFileSync(outPath, md);
  console.log(`\nReport written to ${outPath}`);

  await mongoose.disconnect();
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
