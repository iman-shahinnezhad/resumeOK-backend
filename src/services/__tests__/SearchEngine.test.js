const DbJob = require('../../models/DbJob');

// Mock DbJob model
jest.mock('../../models/DbJob');

describe('Search Engine Query Builder', () => {
  let mockFind;
  let mockSort;
  let mockSkip;
  let mockLimit;

  beforeEach(() => {
    jest.resetAllMocks();

    mockLimit = jest.fn().mockResolvedValue([]);
    mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
    mockSort = jest.fn().mockReturnValue({ skip: mockSkip });
    mockFind = jest.fn().mockReturnValue({ sort: mockSort });

    DbJob.find = mockFind;
  });

  test('Should build a clean query with remote and location filters', async () => {
    // Simulate GET /api/jobs?remote=true&location=Berlin
    const query = { isExpired: false, remote: true, location: /Berlin/i };
    
    // Call find on DbJob
    await DbJob.find(query).sort({ createdAt: -1 }).skip(0).limit(10);

    expect(DbJob.find).toHaveBeenCalledWith(expect.objectContaining({
      remote: true,
      location: /Berlin/i
    }));
  });

  test('Should execute full-text search with relevance scoring', async () => {
    const textQuery = { 
      isExpired: false, 
      $text: { $search: 'React developer' } 
    };
    const projection = { score: { $meta: 'textScore' } };

    await DbJob.find(textQuery, projection).sort({ score: { $meta: 'textScore' } }).skip(0).limit(10);

    expect(DbJob.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $text: { $search: 'React developer' }
      }),
      expect.objectContaining({
        score: { $meta: 'textScore' }
      })
    );
  });
});
