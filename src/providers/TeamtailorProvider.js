const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * Teamtailor ATS Provider
 */
class TeamtailorProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Teamtailor.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://${companySlug}.teamtailor.com/jobs.json`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data)) return [];
      return data.map(job => new Job({
        id: String(job.id),
        provider: 'teamtailor',
        company: companySlug.toUpperCase(),
        title: job.title,
        description: job.body || '',
        requirements: '',
        salary: null,
        location: job.location || 'Remote',
        employmentType: job.employment_type || 'Full-time',
        remote: String(job.location || '').toLowerCase().includes('remote') || !!job.remote,
        applicationUrl: job.url || '',
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`Teamtailor fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit application to Teamtailor.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to Teamtailor' };
  }
}

module.exports = TeamtailorProvider;
