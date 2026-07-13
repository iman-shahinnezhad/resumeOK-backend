const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * Recruitee ATS Provider
 */
class RecruiteeProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Recruitee.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://${companySlug}.recruitee.com/api/offers`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.offers || !Array.isArray(data.offers)) return [];
      return data.offers.map(offer => new Job({
        id: String(offer.id),
        provider: 'recruitee',
        company: companySlug.toUpperCase(),
        title: offer.title,
        description: offer.description || '',
        requirements: offer.requirements || '',
        salary: null,
        location: offer.location || 'Remote',
        employmentType: offer.employment_type || 'Full-time',
        remote: !!offer.remote || String(offer.location || '').toLowerCase().includes('remote'),
        applicationUrl: offer.careers_url || '',
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`Recruitee fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit application to Recruitee.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to Recruitee' };
  }
}

module.exports = RecruiteeProvider;
