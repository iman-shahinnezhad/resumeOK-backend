const { extractSkills } = require('../SkillExtractor');

describe('Skill Extractor Utility', () => {
  test('Should extract multiple skills from text fields', () => {
    const title = 'React and Next.js Backend Engineer';
    const description = 'Looking for a developer skilled in Node.js, TypeScript, and AWS.';
    const requirements = 'Must have experience with Docker, PostgreSQL, and GraphQL. Experience with LLMs, RAG, and LangChain is a plus.';

    const skills = extractSkills(title, description, requirements);

    expect(skills).toContain('React');
    expect(skills).toContain('Next.js');
    expect(skills).toContain('Node.js');
    expect(skills).toContain('AWS');
    expect(skills).toContain('Docker');
    expect(skills).toContain('PostgreSQL');
    expect(skills).toContain('GraphQL');
    expect(skills).toContain('LLMs');
    expect(skills).toContain('RAG');
    expect(skills).toContain('LangChain');
  });

  test('Should perform case-insensitive and case-sensitive checks for Go', () => {
    // Golang is case-insensitive
    expect(extractSkills('', 'we use golang', '')).toContain('Go');

    // Case-sensitive "Go" matches
    expect(extractSkills('', 'we use Go for backend services', '')).toContain('Go');

    // Normal lowercase "go" does NOT trigger Go (lang) matching
    expect(extractSkills('', 'you should go to the office daily', '')).not.toContain('Go');
  });
});
