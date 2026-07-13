const GreenhouseProvider = require('./GreenhouseProvider');
const LeverProvider = require('./LeverProvider');
const AshbyProvider = require('./AshbyProvider');
const WorkdayProvider = require('./WorkdayProvider');
const TeamtailorProvider = require('./TeamtailorProvider');
const SmartRecruitersProvider = require('./SmartRecruitersProvider');
const JobviteProvider = require('./JobviteProvider');
const RecruiteeProvider = require('./RecruiteeProvider');
const BambooHRProvider = require('./BambooHRProvider');
const ICIMSProvider = require('./ICIMSProvider');

/**
 * ProviderRegistry manages registered ATS provider instances.
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    // Register default providers
    this.register('greenhouse', new GreenhouseProvider());
    this.register('lever', new LeverProvider());
    this.register('ashby', new AshbyProvider());
    this.register('workday', new WorkdayProvider());
    this.register('teamtailor', new TeamtailorProvider());
    this.register('smartrecruiters', new SmartRecruitersProvider());
    this.register('jobvite', new JobviteProvider());
    this.register('recruitee', new RecruiteeProvider());
    this.register('bamboohr', new BambooHRProvider());
    this.register('icims', new ICIMSProvider());
  }

  /**
   * Register a new job provider.
   * @param {string} name - Unique provider identifier.
   * @param {JobProvider} providerInstance - Instance of the provider.
   */
  register(name, providerInstance) {
    this.providers.set(name.toLowerCase(), providerInstance);
  }

  /**
   * Resolve a registered provider.
   * @param {string} name - The provider identifier.
   * @returns {JobProvider} The registered provider instance.
   */
  get(name) {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Job provider '${name}' is not registered`);
    }
    return provider;
  }
}

module.exports = new ProviderRegistry();
