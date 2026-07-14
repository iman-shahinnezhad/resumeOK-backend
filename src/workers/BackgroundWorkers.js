const Company = require('../models/Company');
const DbJob = require('../models/DbJob');
const ProviderRegistry = require('../providers/ProviderRegistry');

// Default seed list to populate the database on first boot (60+ companies)
const DEFAULT_SEED_COMPANIES = [
  { name: 'stripe', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/stripe' },
  { name: 'dropbox', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/dropbox' },
  { name: 'deliveroo', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/deliveroo' },
  { name: 'vimeo', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/vimeo' },
  { name: 'amplitude', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/amplitude' },
  { name: 'airbnb', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/airbnb' },
  { name: 'figma', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/figma' },
  { name: 'reddit', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/reddit' },
  { name: 'uber', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/uber' },
  { name: 'github', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/github' },
  { name: 'twilio', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/twilio' },
  { name: 'asana', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/asana' },
  { name: 'pinterest', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/pinterest' },
  { name: 'robinhood', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/robinhood' },
  { name: 'hashicorp', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/hashicorp' },
  { name: 'lyft', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/lyft' },
  { name: 'zoom', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/zoom' },
  { name: 'databricks', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/databricks' },
  { name: 'snowflake', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/snowflake' },
  { name: 'coinbase', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/coinbase' },
  { name: 'snapchat', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/snapchat' },
  { name: 'squarespace', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/squarespace' },
  { name: 'gusto', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/gusto' },
  { name: 'plaid', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/plaid' },
  { name: 'chime', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/chime' },
  { name: 'wealthfront', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/wealthfront' },
  { name: 'flexport', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/flexport' },
  { name: 'affirm', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/affirm' },
  { name: 'nerdwallet', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/nerdwallet' },
  { name: 'instacart', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/instacart' },
  { name: 'grubhub', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/grubhub' },
  { name: 'doordash', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/doordash' },
  { name: 'okta', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/okta' },
  { name: 'elastic', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/elastic' },
  { name: 'confluent', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/confluent' },
  { name: 'gitlab', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/gitlab' },
  { name: 'intercom', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/intercom' },
  { name: 'sentry', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/sentry' },
  { name: 'postman', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/postman' },
  { name: 'notion', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/notion' },
  { name: 'vercel', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/vercel' },
  { name: 'netlify', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/netlify' },
  { name: 'huggingface', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/huggingface' },
  { name: 'miro', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/miro' },
  { name: 'canva', provider: 'greenhouse', careerUrl: 'https://boards.greenhouse.io/canva' },
  { name: 'kinsta', provider: 'lever', careerUrl: 'https://jobs.lever.co/kinsta' },
  { name: 'aircall', provider: 'lever', careerUrl: 'https://jobs.lever.co/aircall' },
  { name: 'palantir', provider: 'lever', careerUrl: 'https://jobs.lever.co/palantir' },
  { name: 'netflix', provider: 'lever', careerUrl: 'https://jobs.lever.co/netflix' },
  { name: 'hotjar', provider: 'lever', careerUrl: 'https://jobs.lever.co/hotjar' },
  { name: 'eventbrite', provider: 'lever', careerUrl: 'https://jobs.lever.co/eventbrite' },
  { name: 'udemy', provider: 'lever', careerUrl: 'https://jobs.lever.co/udemy' },
  { name: 'shopify', provider: 'lever', careerUrl: 'https://jobs.lever.co/shopify' },
  { name: 'atlassian', provider: 'lever', careerUrl: 'https://jobs.lever.co/atlassian' },
  { name: '1password', provider: 'lever', careerUrl: 'https://jobs.lever.co/1password' },
  { name: 'docker', provider: 'lever', careerUrl: 'https://jobs.lever.co/docker' },
  { name: 'snyk', provider: 'lever', careerUrl: 'https://jobs.lever.co/snyk' },
  { name: 'grafana', provider: 'lever', careerUrl: 'https://jobs.lever.co/grafana' },
  { name: 'datadog', provider: 'lever', careerUrl: 'https://jobs.lever.co/datadog' },
  { name: 'cockroach', provider: 'lever', careerUrl: 'https://jobs.lever.co/cockroach' }
];

/**
 * Executes a list of asynchronous task factories in parallel with limited concurrency.
 */
async function promiseLimit(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/**
 * BackgroundWorkers Manager
 */
class BackgroundWorkers {
  constructor() {
    this.intervals = [];
  }

  /**
   * Seed default companies if they are not already in the collection.
   */
  async seedCompanies() {
    try {
      console.log('Checking and seeding default company list...');
      let seededCount = 0;
      for (const seed of DEFAULT_SEED_COMPANIES) {
        const nameUpper = seed.name.toUpperCase().trim();
        const exists = await Company.findOne({ name: nameUpper });
        if (!exists) {
          await Company.create({
            name: nameUpper,
            careerUrl: seed.careerUrl,
            provider: seed.provider,
            boardUrl: seed.careerUrl,
            nextScanAt: new Date()
          });
          seededCount++;
        }
      }
      if (seededCount > 0) {
        console.log(`Successfully seeded ${seededCount} new companies.`);
      } else {
        console.log('All default seed companies are already present.');
      }
    } catch (e) {
      console.error('Error seeding companies:', e);
    }
  }

  /**
   * Scan companies due for updates and refresh their job lists.
   * @param {number} concurrencyLimit - Max concurrent scraper threads.
   */
  async refreshJobs(concurrencyLimit = 3) {
    console.log('--- Background Job Refresh Start ---');
    const scanStartTime = new Date();

    try {
      await this.seedCompanies();
      const queryCursor = Company.find({
        $or: [
          { nextScanAt: { $lte: new Date() } },
          { nextScanAt: null }
        ]
      });

      // Limit to 30 companies per sync pass to avoid CPU/connection starvation
      const companies = typeof queryCursor.limit === 'function' 
        ? await queryCursor.limit(30) 
        : await queryCursor;

      if (companies.length === 0) {
        console.log('No companies due for job refresh.');
        console.log('--- Background Job Refresh End ---');
        return;
      }

      console.log(`Found ${companies.length} companies to scan. Limit concurrency to ${concurrencyLimit}.`);

      const tasks = companies.map(company => async () => {
        const companyName = company.name.toLowerCase();
        let providerInstance;
        try {
          providerInstance = ProviderRegistry.get(company.provider);
        } catch (err) {
          console.error(`Skipping ${companyName}: unregistered provider ${company.provider}`);
          return;
        }

        // Retry mechanism: try fetching up to 3 times
        let jobs = [];
        let success = false;
        let attempts = 0;
        
        while (attempts < 3 && !success) {
          attempts++;
          try {
            console.log(`Scanning jobs for ${company.name} (Attempt ${attempts}/3)...`);
            jobs = await providerInstance.fetchJobs(companyName);
            success = true;
          } catch (fetchErr) {
            console.warn(`Attempt ${attempts} failed for ${company.name}:`, fetchErr.message);
            if (attempts < 3) {
              const backoffDelay = 1000 * Math.pow(3, attempts - 1); // 1s, 3s, 9s...
              await new Promise(r => setTimeout(r, backoffDelay));
            }
          }
        }

        if (!success) {
          console.error(`Failed to refresh jobs for ${company.name} after 3 attempts.`);
          // Schedule next retry in 1 hour
          company.nextScanAt = new Date(Date.now() + 60 * 60 * 1000);
          await company.save();
          return;
        }

        console.log(`Retrieved ${jobs.length} active jobs for ${company.name}. Syncing database...`);

        // Upsert active jobs in local database
        for (const job of jobs) {
          try {
            // Deduplication: Check if active job with same title, company, and location already exists (exact indexed match)
            const exists = await DbJob.findOne({
              company: company.name.toUpperCase(),
              title: job.title.trim(),
              location: job.location.trim(),
              isExpired: false
            });

            const queryCond = exists 
              ? { _id: exists._id }
              : { provider: job.provider, jobId: job.id };

            await DbJob.findOneAndUpdate(
              queryCond,
              {
                jobId: job.id,
                provider: job.provider,
                company: company.name.toUpperCase(),
                title: job.title,
                description: job.description,
                requirements: job.requirements,
                salary: job.salary,
                location: job.location,
                employmentType: job.employmentType,
                remote: job.remote,
                applicationUrl: job.applicationUrl,
                canApplyDirectly: job.canApplyDirectly,
                skills: job.skills,
                postedAt: job.postedAt,
                updatedAt: job.updatedAt,
                isExpired: false,
                lastSeenAt: scanStartTime
              },
              { upsert: true }
            );
          } catch (dbErr) {
            console.error(`Failed to upsert job ${job.id} for ${company.name}:`, dbErr.message);
          }
        }

        // Mark missing jobs as expired
        const expireResult = await DbJob.updateMany(
          { 
            company: company.name.toUpperCase(), 
            provider: company.provider, 
            lastSeenAt: { $lt: scanStartTime } 
          },
          { $set: { isExpired: true } }
        );
        
        if (expireResult.modifiedCount > 0) {
          console.log(`Flagged ${expireResult.modifiedCount} stale jobs as expired for ${company.name}`);
        }

        // Schedule next scan in 12 hours
        company.lastScannedAt = scanStartTime;
        company.nextScanAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
        await company.save();

        // 500ms throttle delay to release Node event loop threads for client APIs
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      await promiseLimit(tasks, concurrencyLimit);

      // Evict search caches after sync finish to display fresh listings
      const cacheService = require('../services/CacheService');
      cacheService.clear();

      console.log('--- Background Job Refresh End ---');
    } catch (e) {
      console.error('Error in refreshJobs worker:', e);
    }
  }

  /**
   * Crawl and discover career site configurations for new domains.
   */
  async discoverNewCompanies() {
    console.log('Starting Company Discovery pass...');
    try {
      const CompanyDiscoveryService = require('../services/CompanyDiscoveryService');
      const companies = await Company.find({ provider: 'unknown' }).limit(10);
      for (const comp of companies) {
        console.log(`Crawl scanning unknown company: ${comp.name}`);
        try {
          await CompanyDiscoveryService.discoverCompany(comp.name, comp.careerUrl || `${comp.name.toLowerCase()}.com`);
        } catch (e) {
          console.error(`Failed discovery for ${comp.name}:`, e.message);
        }
      }
    } catch (e) {
      console.error('Error in discoverNewCompanies worker:', e);
    }
  }

  /**
   * Remove expired jobs older than 7 days from the database.
   */
  async cleanExpiredJobs() {
    console.log('Purging stale expired jobs...');
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await DbJob.deleteMany({
        isExpired: true,
        lastSeenAt: { $lt: sevenDaysAgo }
      });
      console.log(`Purged ${result.deletedCount} expired jobs older than 7 days.`);
    } catch (e) {
      console.error('Error in cleanExpiredJobs worker:', e);
    }
  }

  /**
   * Scan existing jobs in the database and backfill missing skills tags.
   */
  async backfillExistingJobSkills() {
    console.log('Starting backfill for existing jobs missing skills...');
    try {
      const { extractSkills } = require('../utils/SkillExtractor');
      const jobs = await DbJob.find({
        $or: [
          { skills: { $size: 0 } },
          { skills: { $exists: false } }
        ]
      });

      if (jobs.length === 0) {
        console.log('No existing jobs require skills backfilling.');
        return;
      }

      console.log(`Found ${jobs.length} jobs to backfill skills. Starting update...`);
      let updatedCount = 0;
      for (const job of jobs) {
        const skills = extractSkills(job.title, job.description || '', job.requirements || '');
        if (skills.length > 0) {
          job.skills = skills;
          await job.save();
          updatedCount++;
        }
      }
      console.log(`Completed skills backfill. Updated ${updatedCount} jobs.`);
    } catch (e) {
      console.error('Error backfilling existing job skills:', e);
    }
  }

  /**
   * Start scheduled background loops inside Node runtime process.
   */
  start() {
    console.log('Initializing scheduled Background Workers...');
    
    // Seed default companies on start
    this.seedCompanies();

    // Backfill existing jobs skills on start
    this.backfillExistingJobSkills();

    // 1. Refresh jobs worker: Every 1 hour
    const refreshInterval = setInterval(() => {
      this.refreshJobs();
    }, 60 * 60 * 1000);
    this.intervals.push(refreshInterval);

    // 2. Discover new companies worker: Every 12 hours
    const discoveryInterval = setInterval(() => {
      this.discoverNewCompanies();
    }, 12 * 60 * 60 * 1000);
    this.intervals.push(discoveryInterval);

    // 3. Stale cleanup worker: Every 24 hours
    const cleanupInterval = setInterval(() => {
      this.cleanExpiredJobs();
    }, 24 * 60 * 60 * 1000);
    this.intervals.push(cleanupInterval);

    // Trigger initial job sync on startup (async)
    setTimeout(() => {
      this.refreshJobs();
    }, 5000);
  }

  /**
   * Clear intervals (for test teardowns)
   */
  stop() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }
}

module.exports = new BackgroundWorkers();
