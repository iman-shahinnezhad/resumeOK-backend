const pdfParse = require('pdf-parse');

const METADATA_BLACKLIST = /^(react-pdf|pdfkit|latex|ghostscript|adobe|wkhtmltopdf|canvas|tcpdf|fpdf|itext|creator|producer|title|author|subject|keywords|template|stockholm|untitled|document|page|font|devicergb|devicecmyk|identity-h|cidfont|xobject)$/i;

const DOMAIN_SKILLS = [
  'Picking', 'Packing', 'Warehouse Operations', 'Inventory Management', 'Logistics', 'Supply Chain',
  'Sanitation', 'Cleaning Equipment', 'Mathematics', 'Deep Sanitation Practices', 'Kaizen', '5S', 'Kanban',
  'Customer Service', 'Sales', 'Management', 'Strategy', 'Communication', 'Problem Solving', 'Leadership',
  'React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'Python', 'Java', 'C++',
  'SQL', 'MongoDB', 'PostgreSQL', 'Docker', 'AWS', 'Git', 'Figma', 'UI/UX', 'HTML', 'CSS', 'Redux'
];

/**
 * Parses raw PDF buffer using pdf-parse text extraction + Google Gemini AI for 100% accurate structured JSON parsing.
 */
async function parseResumeBuffer(bufferOrBase64, fileName = 'resume.pdf') {
  let buffer;
  if (Buffer.isBuffer(bufferOrBase64)) {
    buffer = bufferOrBase64;
  } else if (typeof bufferOrBase64 === 'string') {
    const base64Data = bufferOrBase64.replace(/^data:application\/pdf;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    throw new Error('Invalid input for PDF parsing');
  }

  const pdfData = await pdfParse(buffer);
  const rawText = pdfData.text || '';
  console.log(`📄 [PDF PARSER] Clean text extracted for ${fileName}. Length: ${rawText.length} characters.`);

  // 1. Try Gemini AI Parsing first for 100% accuracy
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && rawText.trim().length > 20) {
    try {
      console.log('🤖 [GEMINI AI] Sending resume text to Google Gemini AI model for structured parsing...');
      const promptText = `
You are an expert AI Resume Parser. Analyze the following raw resume text and extract all candidate details into structured JSON matching this exact schema:

{
  "fullName": "Full Candidate Name",
  "firstName": "First Name",
  "lastName": "Last Name",
  "email": "email@domain.com",
  "phone": "Phone Number",
  "location": "City, State or Country",
  "linkedinUrl": "LinkedIn URL if present",
  "portfolioUrl": "Website/GitHub/Portfolio URL if present",
  "targetRole": "Current or Target Job Title",
  "experienceYears": 5,
  "experienceLevel": "Entry-level | 1-3 years | 3+ years | 5+ years | 7+ years",
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "workExperiences": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "Location",
      "dates": "Date Range",
      "description": "Responsibilities and accomplishments"
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "location": "Location",
      "year": "Graduation Year / Date Range"
    }
  ]
}

CRITICAL RULES:
- Extract real values directly from the text.
- Do NOT use metadata terms like "react-pdf", "pdfkit", "template", "stockholm".
- Return ONLY valid JSON without markdown code fences or extra explanation text.

RESUME TEXT:
${rawText}
`.trim();

      console.log("===== TEXT SENT TO GEMINI =====");
      console.log(rawText);
      console.log("===== END GEMINI INPUT =====");

      let response = null;
      const modelNames = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-exp'];

      for (const model of modelNames) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
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

      if (response && response.ok) {
        const resData = await response.json();
        const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log("===== RAW GEMINI RESPONSE =====");
        console.log(candidateText || JSON.stringify(resData, null, 2));
        console.log("===== END GEMINI RESPONSE =====");
        if (candidateText) {
          const cleanJsonStr = candidateText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const aiParsed = JSON.parse(cleanJsonStr);
          console.log('✨ 🤖 [GEMINI AI SUCCESS] Successfully extracted structured resume data via Gemini!');
          return {
            fullName: aiParsed.fullName || undefined,
            firstName: aiParsed.firstName || (aiParsed.fullName ? aiParsed.fullName.split(' ')[0] : undefined),
            lastName: aiParsed.lastName || (aiParsed.fullName ? aiParsed.fullName.split(' ').slice(1).join(' ') : undefined),
            email: aiParsed.email || undefined,
            phone: aiParsed.phone || undefined,
            location: aiParsed.location || undefined,
            linkedinUrl: aiParsed.linkedinUrl || undefined,
            portfolioUrl: aiParsed.portfolioUrl || undefined,
            targetRole: aiParsed.targetRole || undefined,
            experienceYears: aiParsed.experienceYears || undefined,
            experienceLevel: aiParsed.experienceLevel || undefined,
            skills: Array.isArray(aiParsed.skills) ? aiParsed.skills : [],
            workExperiences: Array.isArray(aiParsed.workExperiences) ? aiParsed.workExperiences : [],
            education: Array.isArray(aiParsed.education) ? aiParsed.education : [],
            rawTextPreview: rawText.slice(0, 300)
          };
        }
      } else {
        const errText = await response.text();
        console.log('Gemini API response error status:', response.status, errText);
      }
    } catch (aiErr) {
      console.error('Gemini AI parsing failed, falling back to rule engine:', aiErr.message);
    }
  }

  // 2. Rule-Based Fallback Engine
  const lines = rawText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0 && !METADATA_BLACKLIST.test(l));

  let email;
  const emailMatch = rawText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) email = emailMatch[1].toLowerCase();

  let phone;
  const phoneMatch = rawText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) phone = phoneMatch[0].trim();

  let linkedinUrl;
  const linkedinMatch = rawText.match(/(linkedin\.com\/in\/[a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) linkedinUrl = `https://${linkedinMatch[1]}`;

  let portfolioUrl;
  const githubMatch = rawText.match(/(github\.com\/[a-zA-Z0-9_-]+)/i);
  if (githubMatch) portfolioUrl = `https://${githubMatch[1]}`;

  let location;
  const locMatch = rawText.match(/\b([A-Z][a-zA-Z\s]+,\s*(?:[A-Z]{2}|Turkey|France|UAE|Dubai|United States|USA|UK|Canada|Germany|Iran|Spain|Italy|Remote))\b/i);
  if (locMatch) location = locMatch[1].trim();

  let fullName;
  let firstName;
  let lastName;
  let targetRole;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (!line.includes('@') && !line.includes('http') && !line.includes('www') && !/\d/.test(line)) {
      if (!/resume|curriculum|vitae|page|profile|work|experience|skills|education|contact/i.test(line)) {
        if (!fullName && (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line) || /^[A-Za-z\s.'-]{3,35}$/.test(line))) {
          fullName = line.trim();
          const parts = fullName.split(/\s+/);
          firstName = parts[0];
          lastName = parts.slice(1).join(' ');
          continue;
        }
        if (fullName && !targetRole && line.length >= 3 && line.length <= 50) {
          targetRole = line.trim();
          break;
        }
      }
    }
  }

  const foundSkills = new Set();
  for (const skill of DOMAIN_SKILLS) {
    const esc = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${esc}(?:$|[^a-zA-Z0-9])`, 'i');
    if (regex.test(rawText)) foundSkills.add(skill);
  }

  return {
    fullName,
    firstName,
    lastName,
    email,
    phone,
    location,
    linkedinUrl,
    portfolioUrl,
    targetRole,
    experienceYears: undefined,
    experienceLevel: undefined,
    skills: Array.from(foundSkills),
    workExperiences: [],
    education: []
  };
}

module.exports = { parseResumeBuffer };
