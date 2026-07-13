const aiMatchingService = require('../AiMatchingService');

describe('AiMatchingService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GEMINI_API_KEY = 'mock_key';
  });

  test('Should analyze and match resume successfully', async () => {
    const mockGeminiResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              score: 85,
              matchingSkills: ['React', 'TypeScript'],
              missingSkills: [{ skill: 'Rust', explanation: 'Read Rust docs.' }],
              coverLetter: 'Dear hiring manager, I am a great match.'
            })
          }]
        }
      }]
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGeminiResponse)
    });

    const result = await aiMatchingService.matchResume(
      { title: 'Dev', description: 'React and Rust Developer' },
      'My resume with React and TypeScript experience.'
    );

    expect(global.fetch).toHaveBeenCalled();
    expect(result.score).toBe(85);
    expect(result.matchingSkills).toContain('React');
    expect(result.missingSkills[0].skill).toBe('Rust');
    expect(result.coverLetter).toBe('Dear hiring manager, I am a great match.');
  });
});
