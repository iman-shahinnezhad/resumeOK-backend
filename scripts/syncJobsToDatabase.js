const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const DbJob = require('../src/models/DbJob');

const mongoUri = process.env.MONGO_URI || 'mongodb://admin:JKWBR3S71ZZLC93KPCF10O@188.166.164.115:27017/resumeok?authSource=admin';

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  console.log('Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri);

  const csvPath = path.join(__dirname, '../jobs_export.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error('jobs_export.csv not found! Run generate-jobs-csv.js first.');
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
  const header = lines[0];
  const dataLines = lines.slice(1);

  console.log(`Found ${dataLines.length} jobs in CSV to sync into MongoDB...`);

  const operations = [];
  let count = 0;

  for (const line of dataLines) {
    const fields = parseCsvLine(line);
    if (fields.length < 5) continue;

    const company = fields[0]?.replace(/^"|"$/g, '').trim();
    const title = fields[1]?.replace(/^"|"$/g, '').trim();
    const location = fields[2]?.replace(/^"|"$/g, '').trim() || 'Remote';
    const category = fields[3]?.replace(/^"|"$/g, '').trim();
    const url = fields[4]?.replace(/^"|"$/g, '').trim();
    const dateStr = fields[5]?.replace(/^"|"$/g, '').trim();

    if (!title || !company) continue;

    // Generate unique jobId from URL or title+company
    let jobId = url ? url.split('/').pop() || `${company}-${title}` : `${company}-${title}`;
    jobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) || `job-${count++}`;

    const isRemote = location.toLowerCase().includes('remote');
    const provider = url.includes('greenhouse.io') ? 'greenhouse' : (url.includes('lever.co') ? 'lever' : 'ashby');

    operations.push({
      updateOne: {
        filter: { provider, jobId },
        update: {
          jobId,
          provider,
          company: company.toUpperCase(),
          title,
          description: `${title} at ${company}. Required skills and experience: ${category}.`,
          location,
          remote: isRemote,
          applicationUrl: url,
          skills: category ? category.split(', ').map(s => s.trim()) : [],
          postedAt: dateStr ? new Date(dateStr) : new Date(),
          isExpired: false,
          lastSeenAt: new Date()
        },
        upsert: true
      }
    });
  }

  console.log(`Prepared ${operations.length} bulk database operations. Inserting/Updating MongoDB in batches...`);

  const batchSize = 1000;
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    await DbJob.bulkWrite(batch);
    console.log(`Synced batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(operations.length / batchSize)} (${Math.min(i + batchSize, operations.length)}/${operations.length})...`);
  }

  const totalInDb = await DbJob.countDocuments({ isExpired: false });
  console.log(`\n🎉 SUCCESS! MongoDB is now synced. Total active jobs in DB: ${totalInDb}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error syncing jobs to DB:', err);
  process.exit(1);
});
