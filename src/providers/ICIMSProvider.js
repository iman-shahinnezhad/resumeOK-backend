const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * iCIMS ATS Provider
 */
class ICIMSProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from iCIMS.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://api.icims.com/customers/${companySlug}/search/portals/jobs`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.jobs || !Array.isArray(data.jobs)) return [];
      return data.jobs.map(job => new Job({
        id: String(job.id),
        provider: 'icims',
        company: companySlug.toUpperCase(),
        title: job.title,
        description: job.description || '',
        requirements: '',
        salary: null,
        location: job.location || 'Remote',
        employmentType: 'Full-time',
        remote: String(job.location || '').toLowerCase().includes('remote'),
        applicationUrl: job.url || '',
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`iCIMS fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit application to iCIMS.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to iCIMS' };
  }
}

module.exports = ICIMSProvider;
