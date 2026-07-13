const mongoose = require('mongoose');

/**
 * DbJob represents a persisted job posting synced from external providers.
 */
const dbJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true },
  provider: { type: String, required: true },
  company: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  requirements: { type: String, default: '' },
  salary: { type: String, default: null },
  location: { type: String, default: 'Remote' },
  employmentType: { type: String, default: 'Full-time' },
  remote: { type: Boolean, default: false },
  applicationUrl: { type: String, default: '' },
  canApplyDirectly: { type: Boolean, default: true },
  skills: [{ type: String }],
  postedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: null },
  isExpired: { type: Boolean, default: false, index: true },
  lastSeenAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Unique compound index to prevent duplicate jobs
dbJobSchema.index({ provider: 1, jobId: 1 }, { unique: true });

// Index search queries
dbJobSchema.index({ title: 'text', description: 'text', location: 'text' });

// Compound indexes for fast query filtering and sorting
dbJobSchema.index({ isExpired: 1, createdAt: -1 });
dbJobSchema.index({ isExpired: 1, remote: 1, location: 1 });
dbJobSchema.index({ isExpired: 1, company: 1 });
dbJobSchema.index({ isExpired: 1, provider: 1 });
dbJobSchema.index({ company: 1, title: 1, location: 1 });

const DbJob = mongoose.model('DbJob', dbJobSchema);

module.exports = DbJob;
