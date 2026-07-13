/**
 * Normalized Internal Job Model
 */
class Job {
  constructor(data = {}) {
    this.id = String(data.id || '');
    this.provider = String(data.provider || '');
    this.company = String(data.company || '');
    this.title = String(data.title || '');
    this.description = String(data.description || '');
    this.requirements = String(data.requirements || '');
    this.salary = data.salary || null;
    this.location = String(data.location || 'Remote');
    this.employmentType = String(data.employmentType || 'Full-time');
    this.remote = typeof data.remote === 'boolean' ? data.remote : false;
    this.applicationUrl = String(data.applicationUrl || '');
    this.canApplyDirectly = typeof data.canApplyDirectly === 'boolean' ? data.canApplyDirectly : true;
    this.skills = Array.isArray(data.skills) ? data.skills : [];
    this.postedAt = data.postedAt || null;
    this.updatedAt = data.updatedAt || null;
  }
}

module.exports = Job;
