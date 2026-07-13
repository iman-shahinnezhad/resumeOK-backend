const CompanyDiscoveryService = require('../CompanyDiscoveryService');

describe('Company Discovery and ATS Detection Service', () => {
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

  const testCases = [
    {
      name: 'Greenhouse redirect',
      url: 'https://boards.greenhouse.io/stripe',
      html: '<html></html>',
      expected: 'greenhouse'
    },
    {
      name: 'Lever redirect',
      url: 'https://jobs.lever.co/kinsta',
      html: '<html></html>',
      expected: 'lever'
    },
    {
      name: 'Ashby script signature',
      url: 'https://careers.example.com',
      html: '<html><script src="https://jobs.ashbyhq.com/embed.js"></script></html>',
      expected: 'ashby'
    },
    {
      name: 'Workday URL signature',
      url: 'https://example.myworkdayjobs.com/careers',
      html: '<html></html>',
      expected: 'workday'
    },
    {
      name: 'Teamtailor iframe signature',
      url: 'https://careers.example.com',
      html: '<html><iframe src="https://teamtailor.com/embed"></iframe></html>',
      expected: 'teamtailor'
    },
    {
      name: 'SmartRecruiters link signature',
      url: 'https://careers.example.com',
      html: '<html><a href="https://jobs.smartrecruiters.com/org">Jobs</a></html>',
      expected: 'smartrecruiters'
    },
    {
      name: 'Jobvite link signature',
      url: 'https://careers.example.com',
      html: '<html><a href="https://jobs.jobvite.com/org">Jobs</a></html>',
      expected: 'jobvite'
    },
    {
      name: 'BambooHR link signature',
      url: 'https://careers.example.com',
      html: '<html><a href="https://example.bamboohr.com/jobs">Jobs</a></html>',
      expected: 'bamboohr'
    },
    {
      name: 'Recruitee widget script signature',
      url: 'https://careers.example.com',
      html: '<html><script src="https://widget.recruitee.com/embed.js"></script></html>',
      expected: 'recruitee'
    },
    {
      name: 'iCIMS links signature',
      url: 'https://careers.example.com',
      html: '<html><a href="https://jobs-icims.com/careers">Jobs</a></html>',
      expected: 'icims'
    }
  ];

  testCases.forEach((tc) => {
    test(`Should detect ${tc.expected} on ${tc.name}`, async () => {
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          url: tc.url,
          text: () => Promise.resolve(tc.html)
        })
      );

      const result = await CompanyDiscoveryService.detectATS(tc.url);
      expect(result.provider).toBe(tc.expected);
    });
  });
});
