const JobProvider = require('./JobProvider');
const Job = require('../models/Job');

/**
 * SmartRecruiters ATS Provider
 */
class SmartRecruitersProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from SmartRecruiters.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const response = await fetch(`https://api.smartrecruiters.com/v1/companies/${companySlug}/postings`);
      if (!response.ok) return [];
      const data = await response.json();
      if (!data.content || !Array.isArray(data.content)) return [];
      return data.content.map(post => new Job({
        id: post.id,
        provider: 'smartrecruiters',
        company: companySlug.toUpperCase(),
        title: post.name,
        description: post.companyDescription || '',
        requirements: post.jobDescription || '',
        salary: null,
        location: post.location?.city || 'Remote',
        employmentType: post.typeOfEmployment?.label || 'Full-time',
        remote: !!post.location?.remote || String(post.location?.city || '').toLowerCase().includes('remote'),
        applicationUrl: `https://jobs.smartrecruiters.com/${companySlug}/${post.id}`,
        canApplyDirectly: true
      }));
    } catch (e) {
      console.error(`SmartRecruiters fetch failed for ${companySlug}:`, e);
      return [];
    }
  }

  /**
   * Submit application to SmartRecruiters.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    return { success: true, message: 'Application mock-submitted to SmartRecruiters' };
  }
}

module.exports = SmartRecruitersProvider;
