const ProviderRegistry = require('../ProviderRegistry');
const GreenhouseProvider = require('../GreenhouseProvider');
const LeverProvider = require('../LeverProvider');

describe('Job Providers Architecture', () => {
  let originalFetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('Registry should resolve default providers', () => {
    const gh = ProviderRegistry.get('greenhouse');
    expect(gh).toBeInstanceOf(GreenhouseProvider);

    const lever = ProviderRegistry.get('lever');
    expect(lever).toBeInstanceOf(LeverProvider);
  });

  test('Registry should throw error on unregistered provider', () => {
    expect(() => ProviderRegistry.get('nonexistent')).toThrow();
  });

  test('GreenhouseProvider should fetch and normalize jobs', async () => {
    const mockJobsResponse = {
      jobs: [
        {
          id: 12345,
          title: 'Software Engineer',
          absolute_url: 'https://example.com/job/12345',
          location: { name: 'San Francisco' },
          content: '<p>Job description</p>'
        }
      ]
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockJobsResponse)
      })
    );

    const provider = ProviderRegistry.get('greenhouse');
    const jobs = await provider.fetchJobs('stripe');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].title).toBe('Software Engineer');
    expect(jobs[0].location).toBe('San Francisco');
    expect(jobs[0].provider).toBe('greenhouse');
  });

  test('LeverProvider should fetch and normalize jobs', async () => {
    const mockPostingsResponse = [
      {
        id: 'lever-id-987',
        text: 'Frontend Engineer',
        applyUrl: 'https://example.com/apply/987',
        categories: { location: 'Remote', team: 'Engineering' },
        description: 'Frontend role description'
      }
    ];

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPostingsResponse)
      })
    );

    const provider = ProviderRegistry.get('lever');
    const jobs = await provider.fetchJobs('kinsta');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://api.lever.co/v0/postings/kinsta?mode=json');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].title).toBe('Frontend Engineer');
    expect(jobs[0].location).toBe('Remote');
    expect(jobs[0].provider).toBe('lever');
  });

  test('AshbyProvider should fetch and normalize jobs', async () => {
    const mockResponse = {
      jobs: [{ id: 'ashby-1', title: 'Ashby Dev', location: 'New York', description: 'desc' }]
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('ashby');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://api.ashbyhq.com/posting-api/job-board/example');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('ashby');
    expect(jobs[0].title).toBe('Ashby Dev');
  });

  test('WorkdayProvider should fetch and normalize jobs', async () => {
    const mockResponse = {
      jobPostings: [{ externalPath: '/job/1', title: 'Workday QA', locationsText: 'Remote' }]
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('workday');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.myworkdayjobs.com/wday/cxs/example/careers/jobs',
      expect.any(Object)
    );
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('workday');
    expect(jobs[0].title).toBe('Workday QA');
  });

  test('TeamtailorProvider should fetch and normalize jobs', async () => {
    const mockResponse = [{ id: 1, title: 'Teamtailor PM', location: 'London', body: 'body' }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('teamtailor');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://example.teamtailor.com/jobs.json');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('teamtailor');
    expect(jobs[0].title).toBe('Teamtailor PM');
  });

  test('SmartRecruitersProvider should fetch and normalize jobs', async () => {
    const mockResponse = {
      content: [{ id: '1', name: 'Smart Dev', location: { city: 'Remote', remote: true } }]
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('smartrecruiters');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://api.smartrecruiters.com/v1/companies/example/postings');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('smartrecruiters');
    expect(jobs[0].title).toBe('Smart Dev');
  });

  test('JobviteProvider should fetch and normalize jobs', async () => {
    const mockResponse = [{ id: '1', title: 'Jobvite Dev', location: 'Austin' }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('jobvite');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://www.jobvite.com/CompanyJobs/JsonFeed.aspx?c=example');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('jobvite');
    expect(jobs[0].title).toBe('Jobvite Dev');
  });

  test('RecruiteeProvider should fetch and normalize jobs', async () => {
    const mockResponse = {
      offers: [{ id: 1, title: 'Recruitee QA', location: 'Amsterdam' }]
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('recruitee');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://example.recruitee.com/api/offers');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('recruitee');
    expect(jobs[0].title).toBe('Recruitee QA');
  });

  test('BambooHRProvider should fetch and normalize jobs', async () => {
    const mockResponse = [{ id: '1', jobTitle: 'Bamboo Dev', location: { city: 'Remote' } }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('bamboohr');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://example.bamboohr.com/jobs/list.php?type=json');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('bamboohr');
    expect(jobs[0].title).toBe('Bamboo Dev');
  });

  test('ICIMSProvider should fetch and normalize jobs', async () => {
    const mockResponse = {
      jobs: [{ id: '1', title: 'iCIMS DevOps', location: 'Remote' }]
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const provider = ProviderRegistry.get('icims');
    const jobs = await provider.fetchJobs('example');

    const Job = require('../../models/Job');
    expect(global.fetch).toHaveBeenCalledWith('https://api.icims.com/customers/example/search/portals/jobs');
    expect(jobs.length).toBe(1);
    expect(jobs[0]).toBeInstanceOf(Job);
    expect(jobs[0].provider).toBe('icims');
    expect(jobs[0].title).toBe('iCIMS DevOps');
  });
});
