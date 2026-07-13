/**
 * Abstract base class for job board providers (e.g. Greenhouse, Lever, etc.)
 */
class JobProvider {
  /**
   * Fetch jobs for a specific company slug.
   * @param {string} companySlug - The company's unique identifier.
   * @returns {Promise<Array>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    throw new Error('fetchJobs() must be implemented by subclass');
  }

  /**
   * Submit a job application.
   * @param {string} jobId - The target job ID.
   * @param {string} companySlug - The company's unique identifier.
   * @param {Object} candidate - Candidate details (firstName, lastName, email, phone).
   * @param {Object} resumeFile - Multer file object containing the resume PDF.
   * @returns {Promise<Object>} The apply result.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    throw new Error('apply() must be implemented by subclass');
  }
}

module.exports = JobProvider;
