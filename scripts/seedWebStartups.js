const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Company = require('../src/models/Company');

const DATA_URL = 'https://raw.githubusercontent.com/outscal/OpenJobs/main/data/companies_v2.json';

async function run() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://admin:JKWBR3S71ZZLC93KPCF10O@188.166.164.115:27017/resumeok?authSource=admin';
  console.log('Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri);

  console.log('Fetching OpenJobs dataset from GitHub...');
  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch dataset: status ${res.status}`);
  }

  const dataset = await res.json();
  console.log(`Successfully fetched ${dataset.length} company entries.`);

  let ghCount = 0;
  let leverCount = 0;
  let otherCount = 0;

  const operations = [];

  for (const item of dataset) {
    if (!item.name) continue;

    const nameUpper = item.name.toUpperCase().trim();
    let provider = 'unknown';
    let boardUrl = '';
    let careerUrl = item.website || '';

    // Check if we can identify Greenhouse/Lever directly from ats_links
    if (item.ats_links && Array.isArray(item.ats_links)) {
      for (const link of item.ats_links) {
        if (link.includes('boards.greenhouse.io')) {
          provider = 'greenhouse';
          boardUrl = link;
          ghCount++;
          break;
        } else if (link.includes('jobs.lever.co')) {
          provider = 'lever';
          boardUrl = link;
          leverCount++;
          break;
        }
      }
    }

    // Fallback: If not Greenhouse/Lever, we can add it as unknown using its custom career links
    if (provider === 'unknown' && item.ats_links && item.ats_links.length > 0) {
      careerUrl = item.ats_links[0];
      otherCount++;
    }

    operations.push({
      updateOne: {
        filter: { name: nameUpper },
        update: {
          name: nameUpper,
          careerUrl,
          provider,
          boardUrl: boardUrl || careerUrl,
          nextScanAt: new Date()
        },
        upsert: true
      }
    });
  }

  console.log(`Prepared ${operations.length} bulk write operations. Executing...`);

  // Execute bulk operations in batches of 1000
  const batchSize = 1000;
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    await Company.bulkWrite(batch);
    console.log(`Executed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(operations.length / batchSize)}`);
  }

  console.log(`Bulk seeding complete! Identified:`);
  console.log(`- Greenhouse companies: ${ghCount}`);
  console.log(`- Lever companies: ${leverCount}`);
  console.log(`- Unknown/Others for auto-discovery: ${otherCount}`);
  console.log(`Total companies in database now: ${await Company.countDocuments()}`);
  
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
