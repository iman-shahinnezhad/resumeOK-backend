const mongoose = require('mongoose');

const userJobSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  appliedJobs: [
    {
      jobId: { type: String, required: true },
      title: { type: String },
      companyName: { type: String },
      location: { type: String },
      url: { type: String },
      date: { type: String },
      timestamp: { type: Number, default: Date.now }
    }
  ],
  rejectedJobs: [
    {
      jobId: { type: String, required: true },
      title: { type: String },
      companyName: { type: String },
      location: { type: String },
      url: { type: String },
      date: { type: String },
      timestamp: { type: Number, default: Date.now }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserJob', userJobSchema);
