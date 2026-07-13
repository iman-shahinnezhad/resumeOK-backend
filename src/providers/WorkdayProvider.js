const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * Workday ATS Provider
 */
class WorkdayProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Workday.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const url = `https://${companySlug}.myworkdayjobs.com/wday/cxs/${companySlug}/careers/jobs`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: "" })
      });
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.jobPostings || !Array.isArray(data.jobPostings)) return [];
      return data.jobPostings.map(post => new Job({
        id: post.bulletinNumber || post.externalPath,
        provider: 'workday',
        company: companySlug.toUpperCase(),
        title: post.title,
        description: post.locationsText || '',
        requirements: '',
        salary: null,
        location: post.locationsText || 'Remote',
        employmentType: post.timeType || 'Full-time',
        remote: String(post.locationsText || '').toLowerCase().includes('remote'),
        applicationUrl: `https://${companySlug}.myworkdayjobs.com${post.externalPath}`,
        canApplyDirectly: false
      }));
    } catch (e) {
      console.error(`Workday fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Workday does not support direct unauthenticated public apply submissions.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    throw new Error('Direct Workday submissions are not supported via public APIs. Please apply on their portal.');
  }
}

module.exports = WorkdayProvider;
