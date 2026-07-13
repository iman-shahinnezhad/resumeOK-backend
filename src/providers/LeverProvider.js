const JobProvider = require('./JobProvider');
const Job = require('../models/Job');
const { extractSkills } = require('../utils/SkillExtractor');

/**
 * Lever ATS Provider
 */
class LeverProvider extends JobProvider {
  /**
   * Fetch jobs for a specific company slug from Lever.
   * @param {string} companySlug
   * @returns {Promise<Array<Job>>} Normalized job list.
   */
  async fetchJobs(companySlug) {
    try {
      const url = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch Lever jobs for ${companySlug}: status ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        return [];
      }
      return data.map((item) => {
        const listsText = item.lists?.map((l) => `<h3>${l.text}</h3>\n${l.content}`).join("\n") || "";
        const isRemote = item.categories?.location?.toLowerCase().includes('remote') || 
          item.categories?.workplaceType?.toLowerCase() === 'remote' || false;
        const skills = extractSkills(item.text, item.description || '', listsText);
        
        return new Job({
          id: item.id,
          provider: 'lever',
          company: companySlug.toUpperCase(),
          title: item.text,
          description: item.description || "",
          requirements: listsText,
          salary: null,
          location: item.categories?.location || "Remote",
          employmentType: item.categories?.commitment || "Full-time",
          remote: isRemote,
          applicationUrl: item.applyUrl,
          canApplyDirectly: true,
          skills: skills,
          postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
          updatedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null
        });
      });
    } catch (error) {
      console.error(`Error in LeverProvider.fetchJobs(${companySlug}):`, error);
      return [];
    }
  }

  /**
   * Submit an application to Lever.
   * @param {string} jobId
   * @param {string} companySlug
   * @param {Object} candidate - { firstName, lastName, email, phone }
   * @param {Object} resumeFile - Multer file { buffer, originalname, mimetype }
   * @returns {Promise<Object>} The apply result.
   */
  async apply(jobId, companySlug, candidate, resumeFile) {
    try {
      const { firstName, lastName, email, phone } = candidate;
      const formData = new FormData();
      formData.append('name', `${firstName} ${lastName}`);
      formData.append('email', email);
      if (phone) formData.append('phone', phone);

      // Create a native File from the Multer buffer
      const fileBlob = new Blob([resumeFile.buffer], { type: resumeFile.mimetype || 'application/pdf' });
      const file = new File([fileBlob], resumeFile.originalname || 'resume.pdf', {
        type: resumeFile.mimetype || 'application/pdf',
      });
      formData.append('resume', file);

      const postResponse = await fetch(
        `https://api.lever.co/v0/postings/${companySlug}/${jobId}/apply`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
          },
          body: formData
        }
      );

      if (!postResponse.ok) {
        const errData = await postResponse.json().catch(() => ({}));
        throw new Error(errData.error || `Lever submit failed with status ${postResponse.status}`);
      }

      return { success: true, message: 'Application submitted successfully to Lever' };
    } catch (error) {
      console.error(`Error in LeverProvider.apply(${jobId}):`, error);
      throw error;
    }
  }
}

module.exports = LeverProvider;
