const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * Jobvite ATS Provider
 */
class JobviteProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Jobvite.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://www.jobvite.com/CompanyJobs/JsonFeed.aspx?c=${companySlug}`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data)) return [];
      return data.map(job => new Job({
        id: String(job.id || job.jobId),
        provider: 'jobvite',
        company: companySlug.toUpperCase(),
        title: job.title || job.name,
        description: job.description || '',
        requirements: '',
        salary: null,
        location: job.location || 'Remote',
        employmentType: job.type || 'Full-time',
        remote: String(job.location || '').toLowerCase().includes('remote'),
        applicationUrl: job.detailUrl || '',
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`Jobvite fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit application to Jobvite.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to Jobvite' };
  }
}

module.exports = JobviteProvider;
