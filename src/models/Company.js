const mongoose = require('mongoose');

/**
 * Company model representing a discovered employer and its career site configuration.
 */
const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  careerUrl: { type: String, default: '' },
  provider: { 
    type: String, 
    enum: [
      'greenhouse', 'lever', 'ashby', 'workday', 'teamtailor', 
      'smartrecruiters', 'jobvite', 'bamboohr', 'recruitee', 'icims', 
      'unknown'
    ],
    default: 'unknown' 
  },
  boardUrl: { type: String, default: '' },
  lastScannedAt: { type: Date, default: null },
  nextScanAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Auto index to optimize next scans lookup
companySchema.index({ nextScanAt: 1 });

const Company = mongoose.model('Company', companySchema);

module.exports = Company;
