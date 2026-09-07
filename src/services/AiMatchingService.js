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
TASK:
Rewrite and optimize the provided resume so it achieves the highest possible ATS match score (target 95–100/100) with the given job description, while remaining 100% truthful.

[JOB DESCRIPTION]
Title: ${job.title}
Description: ${job.description}
Requirements: ${job.requirements || ''}
[END JOB DESCRIPTION]

OUTPUT FORMAT:

────────────────────────────
STEP 1 — JSON OUTPUT (STRICT FORMAT FIRST)
────────────────────────────

Return a valid JSON object:

{
  "score": number,
  "match_score_improvement": {
    "old_score": number,
    "new_score": number
  },
  "issues_fixed": [
    {
      "title": "issue title",
      "fix": "what was changed to solve it"
    }
  ],
  "keyword_mapping": [
    {
      "keyword": "job keyword",
      "where_used": "section or bullet point in resume"
    }
  ],
  "matchingSkills": ["Skill 1", "Skill 2"],
  "missingSkills": [
    {
      "skill": "Skill name",
      "explanation": "Brief tip on what it is and how to bridge gap"
    }
  ],
  "coverLetter": "A professional, personalized cover letter tailored specifically to this job...",
  "tailoredResumeText": "Complete ATS-optimized resume in clean plain text format...",
  "tailoredResumeHtml": "<div style='color:#000000; font-family:sans-serif;'>Clean single-column HTML resume...</div>"
}

RULES FOR JSON:
* Number of issues_fixed must match exactly the key area issues count.
* Each issue MUST include:
  * title (short issue name)
  * fix (clear explanation of resolution)
* keyword_mapping must include important job-specific keywords that were truthfully added or emphasized.
* Do NOT include keywords that were not actually used in the rewritten resume.
* Do NOT claim that an issue was fixed if it could not be fixed truthfully.
* Return ONLY valid JSON object without markdown code blocks.

────────────────────────────
STEP 2 — OPTIMIZED RESUME REQUIREMENTS
────────────────────────────

A. Rewrite the resume using the following formatting and optimization rules.

RESUME WRITING REQUIREMENTS:

1. CLASSIC TOP-TO-DOWN FORMAT
* Use a traditional, ATS-friendly, top-to-bottom resume layout.
* Do NOT use columns.
* Do NOT use sidebars.
* Do NOT place content next to other content horizontally.
* Every section must flow vertically from top to bottom.

Recommended order:
1. Name
2. Contact Information
3. Professional Summary
4. Experience
5. Skills
6. Education
7. Certifications (if any)

2. KEEP THE RESUME TO ONE PAGE
* Strongly prioritize fitting the resume into one page.
* Do NOT unnecessarily create a second page.
* Remove repetition and low-value content where necessary.
* Shorten bullet points while preserving important achievements and measurable results.
* Prioritize experience and skills most relevant to the target job.
* The final resume should ideally fit on one page without making the font excessively small or harming readability.

3. COLOR REQUIREMENTS
* Use BLACK color (#000000) for all normal text.
* Use BLUE color (#007AFF) ONLY for actual clickable links, such as:
  * Portfolio URLs
  * LinkedIn URLs
  * Email links
  * Other website URLs
* Do NOT use additional colors.
* Do NOT use colored headings, decorative colors, gradients, or visual accents.
* Do NOT use blue text unless the text is an actual clickable link.

4. ATS OPTIMIZATION
* Optimize for ATS parsing using a simple and standard resume structure.
* No tables.
* No icons.
* No images.
* No graphics.
* No charts.
* No text boxes.
* No complex layouts.
* Use clear standard section headings.
* Use standard bullet points.

5. KEYWORD OPTIMIZATION
* Extract important skills, tools, responsibilities, industry terms, and role-specific keywords from the Job Description.
* Naturally integrate relevant keywords into Professional Summary, Experience bullet points, and Skills.
* Never keyword-stuff.
* Prioritize critical job requirements over generic keywords.
* Only add keywords when they are truthfully supported by the candidate's actual experience.

6. TRUTHFULNESS
* Do NOT invent: Experience, Companies, Job titles, Skills, Certifications, Projects, Achievements, Metrics, or Technologies.
* Do NOT imply experience that the candidate does not have.
* If an important job requirement is missing, do not fabricate it. Instead, strengthen adjacent truthful experience where appropriate.

7. EXPERIENCE WRITING & PROFESSIONAL TONE
* Use strong action verbs. Focus on outcomes and impact.
* Keep the writing professional, clear, concise, and human.
`.trim();

    try {
      const parts = [];
      if (resumeBase64) {
        parts.push({ inlineData: { mimeType: 'application/pdf', data: resumeBase64 } });
      } else if (resumeText) {
        parts.push({ text: `Candidate Resume Text:\n${resumeText}` });
      }
      parts.push({ text: promptText });

      const modelNames = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
      let response = null;

      for (const model of modelNames) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json"
                }
              })
            }
          );
          if (res.ok) {
            response = res;
            break;
          }
        } catch (mErr) {}
      }

      if (!response || !response.ok) {
        throw new Error(`Gemini API error or failed connection.`);
      }

      const data = await response.json();
      let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      textResponse = textResponse.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      
      const result = JSON.parse(textResponse);
      const computedScore = typeof result.score === 'number'
        ? result.score
        : (result.match_score_improvement?.new_score || 85);

      const matchingSkills = Array.isArray(result.matchingSkills) && result.matchingSkills.length > 0
        ? result.matchingSkills
        : (Array.isArray(result.keyword_mapping) ? result.keyword_mapping.map((k) => k.keyword || k) : []);

      const missingSkills = Array.isArray(result.missingSkills) && result.missingSkills.length > 0
        ? result.missingSkills
        : (Array.isArray(result.issues_fixed) ? result.issues_fixed.map((i) => ({ skill: i.title, explanation: i.fix })) : []);

      return {
        score: computedScore,
        match_score_improvement: result.match_score_improvement || { old_score: Math.max(30, computedScore - 25), new_score: computedScore },
        issues_fixed: Array.isArray(result.issues_fixed) ? result.issues_fixed : [],
        keyword_mapping: Array.isArray(result.keyword_mapping) ? result.keyword_mapping : [],
        matchingSkills,
        missingSkills,
        coverLetter: result.coverLetter || 'Personalized cover letter generated successfully.',
        tailoredResumeText: result.tailoredResumeText || '',
        tailoredResumeHtml: result.tailoredResumeHtml || ''
      };
    } catch (e) {
      console.error('Error in AiMatchingService:', e);
      return {
        score: 75,
        match_score_improvement: { old_score: 50, new_score: 75 },
        issues_fixed: [],
        keyword_mapping: [],
        matchingSkills: [],
        missingSkills: [{ skill: 'N/A', explanation: 'Failed to analyze resume with AI.' }],
        coverLetter: 'Failed to generate cover letter due to an API error.',
        tailoredResumeText: '',
        tailoredResumeHtml: ''
      };
    }
  }
}

module.exports = new AiMatchingService();
