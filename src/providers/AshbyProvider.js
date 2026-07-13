const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * Ashby ATS Provider
 */
class AshbyProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Ashby.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${companySlug}`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.jobs || !Array.isArray(data.jobs)) return [];
      return data.jobs.map(job => new Job({
        id: job.id,
        provider: 'ashby',
        company: companySlug.toUpperCase(),
        title: job.title,
        description: job.description || '',
        requirements: '',
        salary: job.compensation?.compensationString || null,
        location: job.location || 'Remote',
        employmentType: job.employmentType || 'Full-time',
        remote: String(job.location || '').toLowerCase().includes('remote'),
        applicationUrl: job.jobUrl || '',
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`Ashby fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit an application to Ashby.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to Ashby' };
  }
}

module.exports = AshbyProvider;
