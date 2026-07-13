const BackgroundWorkers = require('../BackgroundWorkers');
const Company = require('../../models/Company');
const DbJob = require('../../models/DbJob');
const ProviderRegistry = require('../../providers/ProviderRegistry');

jest.mock('../../models/Company');
jest.mock('../../models/DbJob');
jest.mock('../../providers/ProviderRegistry');

describe('Background Workers Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('seedCompanies should create companies if count is 0', async () => {
    Company.countDocuments.mockResolvedValue(0);
    Company.create.mockResolvedValue({});

    await BackgroundWorkers.seedCompanies();

    expect(Company.countDocuments).toHaveBeenCalled();
    expect(Company.create).toHaveBeenCalled();
  });

  test('seedCompanies should skip if count is greater than 0', async () => {
    Company.countDocuments.mockResolvedValue(10);

    await BackgroundWorkers.seedCompanies();

    expect(Company.countDocuments).toHaveBeenCalled();
    expect(Company.create).not.toHaveBeenCalled();
  });

  test('refreshJobs should skip if no companies are due', async () => {
    Company.countDocuments.mockResolvedValue(5);
    Company.find.mockResolvedValue([]);

    await BackgroundWorkers.refreshJobs();

    expect(Company.find).toHaveBeenCalled();
    expect(DbJob.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('refreshJobs should fetch, upsert, and expire stale jobs', async () => {
    const mockCompany = {
      name: 'KINSTA',
      provider: 'lever',
      save: jest.fn().mockResolvedValue({})
    };

    Company.countDocuments.mockResolvedValue(5);
    Company.find.mockResolvedValue([mockCompany]);

    const mockJob = {
      id: 'job-1',
      provider: 'lever',
      title: 'Dev',
      description: 'desc',
      location: 'Remote',
      remote: true,
      canApplyDirectly: true,
      skills: []
    };

    const mockProvider = {
      fetchJobs: jest.fn().mockResolvedValue([mockJob])
    };

    ProviderRegistry.get.mockReturnValue(mockProvider);
    DbJob.findOneAndUpdate.mockResolvedValue({});
    DbJob.updateMany.mockResolvedValue({ modifiedCount: 1 });

    await BackgroundWorkers.refreshJobs();

    expect(mockProvider.fetchJobs).toHaveBeenCalledWith('kinsta');
    expect(DbJob.findOneAndUpdate).toHaveBeenCalled();
    expect(DbJob.updateMany).toHaveBeenCalled();
    expect(mockCompany.save).toHaveBeenCalled();
  });
});
