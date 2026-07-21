/**
 * AI Matching Service
 */
class AiMatchingService {
  /**
   * Match a resume against a job posting details using Gemini AI.
   * @param {object} job - { title, description, requirements }
   * @param {string} resumeText - Full text of the candidate's resume.
   * @param {string} resumeBase64 - Base64 encoded PDF document of the resume (optional).
   * @returns {Promise<object>} Structured match response.
   */
  async matchResume(job, resumeText, resumeBase64) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.startsWith('AQ.Ab8RN6L') || apiKey.includes('PLACEHOLDER') || apiKey.includes('YOUR_API_KEY')) {
      console.log('Skipping backend Gemini call: API key is invalid, empty, or deactivated.');
      return {
        score: 50,
        matchingSkills: [],
        missingSkills: [{ skill: 'N/A', explanation: 'Failed to analyze resume with AI (API Key not configured).' }],
        coverLetter: 'Failed to generate cover letter because the server API Key is not configured.',
        tailoredResumeHtml: ''
      };
    }
    const promptText = `
You are an expert recruiter and career coach.
Analyze the candidate's resume against the job description.
[START_JOB]
Title: ${job.title}
Description: ${job.description}
Requirements: ${job.requirements || ''}
[END_JOB]

Provide a JSON response with the following keys:
1. "score": a number from 0 to 100 representing how compatible the resume is with this job description.
2. "matchingSkills": an array of strings representing technologies, tools, or concepts from the job description that the resume explicitly or implicitly possesses.
3. "missingSkills": an array of objects, where each object has keys "skill" (the name of the technology or concept missing) and "explanation" (a brief tip on what it is and how they can bridge this gap).
4. "coverLetter": a professional, personalized cover letter tailored specifically to this job, highlighting the candidate's matching strengths and expressing interest.
5. "tailoredResumeHtml": the candidate's resume rewritten and tailored strictly in clean HTML format (start with <div> and end with </div>) to optimize keywords and achievement phrasing naturally to match the job description. Do NOT include markdown code blocks.

Return ONLY a valid JSON object. Do not include markdown wraps (like \`\`\`json).
`;

    try {
      const parts = [];
      if (resumeBase64) {
        parts.push({ inlineData: { mimeType: 'application/pdf', data: resumeBase64 } });
      } else if (resumeText) {
        parts.push({ text: `Candidate Resume Text:\n${resumeText}` });
      }
      parts.push({ text: promptText });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }]
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}`);
      }

      const data = await response.json();
      let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Clean up markdown block wraps if present
      textResponse = textResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      
      const result = JSON.parse(textResponse);
      return {
        score: typeof result.score === 'number' ? result.score : 50,
        matchingSkills: Array.isArray(result.matchingSkills) ? result.matchingSkills : [],
        missingSkills: Array.isArray(result.missingSkills) ? result.missingSkills : [],
        coverLetter: result.coverLetter || 'Failed to generate cover letter.',
        tailoredResumeHtml: result.tailoredResumeHtml || ''
      };
    } catch (e) {
      console.error('Error in AiMatchingService:', e);
      // Fallback response on API failure
      return {
        score: 50,
        matchingSkills: [],
        missingSkills: [{ skill: 'N/A', explanation: 'Failed to analyze resume with AI.' }],
        coverLetter: 'Failed to generate cover letter due to an API error.',
        tailoredResumeHtml: ''
      };
    }
  }
}

module.exports = new AiMatchingService();
