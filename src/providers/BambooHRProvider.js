const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * BambooHR ATS Provider
 */
class BambooHRProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from BambooHR.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://${companySlug}.bamboohr.com/jobs/list.php?type=json`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data)) return [];
      return data.map(job => new Job({
        id: String(job.id),
        provider: 'bamboohr',
        company: companySlug.toUpperCase(),
        title: job.jobTitle || job.title,
        description: job.department || '',
        requirements: '',
        salary: null,
        location: job.location?.city || 'Remote',
        employmentType: job.type || 'Full-time',
        remote: String(job.location?.city || '').toLowerCase().includes('remote'),
        applicationUrl: `https://${companySlug}.bamboohr.com/jobs/view.php?id=${job.id}`,
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`BambooHR fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit application to BambooHR.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to BambooHR' };
  }
}

module.exports = BambooHRProvider;
