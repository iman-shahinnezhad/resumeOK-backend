const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const GreenhouseProvider = require('../src/providers/GreenhouseProvider');
const LeverProvider = require('../src/providers/LeverProvider');
const AshbyProvider = require('../src/providers/AshbyProvider');
const DbJob = require('../src/models/DbJob');

const ghProvider = new GreenhouseProvider();
const leverProvider = new LeverProvider();
const ashbyProvider = new AshbyProvider();

const DATA_URL = 'https://raw.githubusercontent.com/outscal/OpenJobs/main/data/companies_v2.json';
const mongoUri = process.env.MONGO_URI || 'mongodb://admin:JKWBR3S71ZZLC93KPCF10O@188.166.164.115:27017/resumeok?authSource=admin';

function extractSlug(url) {
  try {
    const cleanUrl = url.split('?')[0].replace(/\/$/, '');
    const parts = cleanUrl.split('/');
    return parts[parts.length - 1];
  } catch (e) {
    return null;
  }
}

function cleanCsvField(str) {
  if (!str) return '""';
  const clean = String(str).replace(/"/g, '""').replace(/\n|\r/g, ' ');
  return `"${clean}"`;
}

async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
    console.log(`Progress: ${Math.min(i + concurrency, items.length)}/${items.length} companies scanned... Total jobs so far: ${results.flat().length}`);
  }
  return results.flat();
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);

  console.log('Fetching OpenJobs dataset (12,144 companies)...');
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error('Failed to fetch dataset');
  const dataset = await res.json();

  const ghSlugs = new Set();
  const leverSlugs = new Set();
  const ashbySlugs = new Set();

  for (const item of dataset) {
    if (!item.ats_links || !Array.isArray(item.ats_links)) continue;
    for (const link of item.ats_links) {
      if (link.includes('boards.greenhouse.io') || link.includes('boards-api.greenhouse.io')) {
        const slug = extractSlug(link);
        if (slug && slug.length > 1 && !slug.includes('.')) ghSlugs.add(slug.toLowerCase());
      } else if (link.includes('jobs.lever.co') || link.includes('api.lever.co')) {
        const slug = extractSlug(link);
        if (slug && slug.length > 1 && !slug.includes('.')) leverSlugs.add(slug.toLowerCase());
      } else if (link.includes('jobs.ashbyhq.com') || link.includes('api.ashbyhq.com')) {
        const slug = extractSlug(link);
        if (slug && slug.length > 1 && !slug.includes('.')) ashbySlugs.add(slug.toLowerCase());
      }
    }
  }

  // Target top 2,500 Greenhouse, 1,000 Lever, 500 Ashby companies -> Total 4,000 Companies
  const ghList = Array.from(ghSlugs).slice(0, 2500);
  const leverList = Array.from(leverSlugs).slice(0, 1000);
  const ashbyList = Array.from(ashbySlugs).slice(0, 500);

  console.log(`🚀 Starting high-speed scan for ${ghList.length} Greenhouse, ${leverList.length} Lever & ${ashbyList.length} Ashby companies (Total: ${ghList.length + leverList.length + ashbyList.length} companies)...`);

  const allJobs = [];

  // 1. Fetch Greenhouse
  console.log('\n--- Scanning Greenhouse Companies ---');
  await mapConcurrent(ghList, 40, async (company) => {
    try {
      const jobs = await ghProvider.fetchJobs(company);
      jobs.forEach(j => {
        allJobs.push({
          company: company.toUpperCase(),
          title: j.title,
          location: j.location || 'Remote',
          category: j.skills?.slice(0, 3).join(', ') || 'Software & Tech',
          url: j.applicationUrl,
          date: j.postedAt ? new Date(j.postedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          provider: 'greenhouse'
        });
      });
    } catch (e) {}
  });

  // 2. Fetch Lever
  console.log('\n--- Scanning Lever Companies ---');
  await mapConcurrent(leverList, 40, async (company) => {
    try {
      const jobs = await leverProvider.fetchJobs(company);
      jobs.forEach(j => {
        allJobs.push({
          company: company.toUpperCase(),
          title: j.title,
          location: j.location || 'Remote',
          category: j.skills?.slice(0, 3).join(', ') || 'Software & Tech',
          url: j.applicationUrl,
          date: j.postedAt ? new Date(j.postedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          provider: 'lever'
        });
      });
    } catch (e) {}
  });

  // 3. Fetch Ashby
  console.log('\n--- Scanning Ashby Companies ---');
  await mapConcurrent(ashbyList, 40, async (company) => {
    try {
      const jobs = await ashbyProvider.fetchJobs(company);
      jobs.forEach(j => {
        allJobs.push({
          company: company.toUpperCase(),
          title: j.title,
          location: j.location || 'Remote',
          category: j.skills?.slice(0, 3).join(', ') || 'Software & Tech',
          url: j.applicationUrl,
          date: j.postedAt ? new Date(j.postedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          provider: 'ashby'
        });
      });
    } catch (e) {}
  });

  console.log(`\n🎉 SCAN COMPLETE! Total jobs collected: ${allJobs.length}`);

  // Write to CSV
  const csvHeader = 'Company,Job Title,Location,Category,Job URL,Date Added\n';
  const csvRows = allJobs.map(j => 
    `${cleanCsvField(j.company)},${cleanCsvField(j.title)},${cleanCsvField(j.location)},${cleanCsvField(j.category)},${cleanCsvField(j.url)},${cleanCsvField(j.date)}`
  ).join('\n');

  const outputPath = path.join(__dirname, '../jobs_export.csv');
  fs.writeFileSync(outputPath, csvHeader + csvRows, 'utf8');
  console.log(`Saved ${allJobs.length} jobs to CSV: ${outputPath}`);

  // Sync to MongoDB
  console.log('Syncing all jobs to MongoDB DbJob collection...');
  const operations = [];
  let count = 0;

  for (const j of allJobs) {
    let jobId = j.url ? j.url.split('/').pop() || `${j.company}-${j.title}` : `${j.company}-${j.title}`;
    jobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50) || `job-${count++}`;
    const isRemote = (j.location || '').toLowerCase().includes('remote');

    operations.push({
      updateOne: {
        filter: { provider: j.provider, jobId },
        update: {
          jobId,
          provider: j.provider,
          company: j.company,
          title: j.title,
          description: `${j.title} at ${j.company}. Category: ${j.category}`,
          location: j.location,
          remote: isRemote,
          applicationUrl: j.url,
          skills: j.category ? j.category.split(', ').map(s => s.trim()) : [],
          postedAt: new Date(j.date),
          isExpired: false,
          lastSeenAt: new Date()
        },
        upsert: true
      }
    });
  }

  const batchSize = 1000;
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    await DbJob.bulkWrite(batch);
  }

  const totalInDb = await DbJob.countDocuments({ isExpired: false });
  console.log(`\n✅ MongoDB database synced. Total active jobs in DB: ${totalInDb}`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error in job harvesting:', err);
  process.exit(1);
});
