const JobProvider = require('./JobProvider');
const Job = require('../models/Job');
const { extractSkills } = require('../utils/SkillExtractor');

/**
 * Greenhouse ATS Provider
 */
class GreenhouseProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Greenhouse.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch Greenhouse jobs for ${companySlug}: status ${response.status}`);
      }
      const data = await response.json();
      if (!data.jobs || !Array.isArray(data.jobs)) {
        return [];
      }
      return data.jobs.map((job) => {
        const isRemote = job.location?.name?.toLowerCase().includes('remote') || false;
        const skills = extractSkills(job.title, job.content || '', '');
        return new Job({
          id: job.id,
          provider: 'greenhouse',
          company: companySlug.toUpperCase(),
          title: job.title,
          description: job.content || "",
          requirements: "",
          salary: null,
          location: job.location?.name || "Remote",
          employmentType: "Full-time",
          remote: isRemote,
          applicationUrl: job.absolute_url,
          canApplyDirectly: true,
          skills: skills,
          postedAt: job.updated_at || null,
          updatedAt: job.updated_at || null
        });
      });
    } catch (error) {
      console.error(`Error in GreenhouseProvider.fetchJobs(${companySlug}):`, error);
      return [];
    }
  }

  /**
   * Submit an application to Greenhouse.
   * @param {string} jobId
   * @param {string} companySlug
   * @param {Object} candidate - { firstName, lastName, email, phone, jobBoardKey }
   * @param {Object} resumeFile - Multer file { buffer, originalname, mimetype }
   * @returns {Promise<Object>} The apply result.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    try {
      const { firstName, lastName, email, phone, jobBoardKey } = candidate;
      const formData = new FormData();
      formData.append('first_name', firstName);
      formData.append('last_name', lastName);
      formData.append('email', email);
      if (phone) formData.append('phone', phone);

      // Create a native File from the Multer buffer
      const fileBlob = new Blob([resumeFile.buffer], { type: resumeFile.mimetype || 'application/pdf' });
      const file = new File([fileBlob], resumeFile.originalname || 'resume.pdf', {
        type: resumeFile.mimetype || 'application/pdf',
      });
      formData.append('resume', file);

      const headers = {};
      if (jobBoardKey) {
        // Basic auth encoding (jobBoardKey + ":")
        const credentials = Buffer.from(`${jobBoardKey}:`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
      headers['Accept'] = 'application/json';

      const postResponse = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs/${jobId}`,
        {
          method: 'POST',
          headers,
          body: formData
        }
      );

      if (!postResponse.ok) {
        const errData = await postResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Greenhouse submit failed with status ${postResponse.status}`);
      }

      return { success: true, message: 'Application submitted successfully to Greenhouse' };
    } catch (error) {
      console.error(`Error in GreenhouseProvider.apply(${jobId}):`, error);
      throw error;
    }
  }
}

module.exports = GreenhouseProvider;
