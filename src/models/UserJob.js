const mongoose = require('mongoose');

const jobRefSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true },
    timestamp: { type: Number, default: Date.now }
  },
  { _id: false }
);

const userJobSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  appliedJobs: [jobRefSchema],
  skippedJobs: [jobRefSchema],
  rejectedJobs: [jobRefSchema],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserJob', userJobSchema);
