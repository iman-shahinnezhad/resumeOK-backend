let pdfParseLib = require('pdf-parse');
if (typeof pdfParseLib !== 'function' && pdfParseLib && pdfParseLib.default) {
  pdfParseLib = pdfParseLib.default;
}

const METADATA_BLACKLIST = /^(react-pdf|pdfkit|latex|ghostscript|adobe|wkhtmltopdf|canvas|tcpdf|fpdf|itext|creator|producer|title|author|subject|keywords|template|stockholm|untitled|document|page|font|devicergb|devicecmyk|identity-h|cidfont|xobject)$/i;

const JOB_TITLE_KEYWORDS = /\b(associate|engineer|developer|manager|director|officer|specialist|consultant|analyst|assistant|lead|coordinator|architect|designer|intern|technician|supervisor|executive|representative|administrator|operator|worker|laborer)\b/i;

const DOMAIN_SKILLS = [
  'Picking', 'Packing', 'Warehouse Operations', 'Inventory Management', 'Logistics', 'Supply Chain',
  'Sanitation', 'Cleaning Equipment', 'Mathematics', 'Deep Sanitation Practices', 'Kaizen', '5S', 'Kanban',
  'Customer Service', 'Sales', 'Management', 'Strategy', 'Communication', 'Problem Solving', 'Leadership',
  'React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'Python', 'Java', 'C++',
  'SQL', 'MongoDB', 'PostgreSQL', 'Docker', 'AWS', 'Git', 'Figma', 'UI/UX', 'HTML', 'CSS', 'Redux'
];

/**
 * Step 2: Quality Detection
 */
function isReliablePdfText(text) {
  if (!text || text.trim().length < 30) {
    return { isReliable: false, readableRatio: 0, garbageRatio: 1.0, reason: 'Text length too short (< 30 chars)' };
  }

  const totalChars = text.length;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const readableWords = words.filter(w => /^[a-zA-Z]{2,25}$/.test(w));
  const readableRatio = words.length > 0 ? readableWords.length / words.length : 0;

  const garbageMatches = text.match(/[\{\}\[\]\~\/\\^\|\*%`\x00-\x08\x0B-\x1F\x7F-\x9F]/g) || [];
  const garbageRatio = garbageMatches.length / Math.max(totalChars, 1);

  const numericIdMatches = text.match(/\b0000\d{4,8}\b/g) || [];
  const numericIdRatio = numericIdMatches.length / Math.max(words.length, 1);

  const keywordMatches = text.match(/\b(experience|education|skills|profile|employment|history|university|college|associate|manager|developer|engineer|january|february|march|april|may|june|july|august|september|october|november|december|phone|email|location|united|states)\b/gi) || [];
  const keywordScore = keywordMatches.length;

  const corruptedGlyphs = text.match(/\b[A-Z]\s+[a-z]{3,4}\s+\\\s+e\s+R\*/g) || [];

  let isReliable = true;
  let reason = 'GOOD quality text';

  if (garbageRatio > 0.15) {
    isReliable = false;
    reason = `High garbage symbol ratio (${(garbageRatio * 100).toFixed(1)}%)`;
  } else if (readableRatio < 0.35) {
    isReliable = false;
    reason = `Low readable word ratio (${(readableRatio * 100).toFixed(1)}%)`;
  } else if (numericIdRatio > 0.08) {
    isReliable = false;
    reason = `Excessive numeric ID strings (${numericIdMatches.length} IDs detected)`;
  } else if (keywordScore < 2) {
    isReliable = false;
    reason = `Low natural language resume keyword score (${keywordScore} keywords)`;
  } else if (corruptedGlyphs.length > 0) {
    isReliable = false;
    reason = `Corrupted PDF glyph stream detected (${corruptedGlyphs.length} glyph artifacts)`;
  }

  return { isReliable, readableRatio, garbageRatio, reason };
}

/**
 * Step 7: Validation & Repair
 */
function validateAndRepairParsedProfile(parsed) {
  const repaired = { ...parsed };

  if (repaired.email) {
    const match = repaired.email.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    repaired.email = match ? match[1].toLowerCase() : undefined;
  }

  if (repaired.portfolioUrl) {
    const p = String(repaired.portfolioUrl).toLowerCase();
    if (p.includes('@') || p.includes('email.com') || p.includes('resume.io') || p.includes('stockholm') || p.includes('template') || p.includes('linkedin.com')) {
      repaired.portfolioUrl = undefined;
    }
  }

  if (repaired.linkedinUrl) {
    const l = String(repaired.linkedinUrl).toLowerCase();
    if (!l.includes('linkedin.com/in/') || l.endsWith('linkedin.com/') || l.endsWith('linkedin.com')) {
      repaired.linkedinUrl = undefined;
    }
  }

  if (repaired.phone) {
    const ph = String(repaired.phone);
    if (/^0+$/.test(ph) || /^0000/.test(ph) || ph.length < 7 || ph.length > 18) {
      repaired.phone = undefined;
    }
  }

  if (repaired.fullName) {
    const f = String(repaired.fullName).trim();
    if (METADATA_BLACKLIST.test(f) || JOB_TITLE_KEYWORDS.test(f) || f.length < 3 || /^\d+$/.test(f) || f.includes('GI X G Y')) {
      repaired.fullName = undefined;
      repaired.firstName = undefined;
      repaired.lastName = undefined;
    } else {
      const parts = f.split(/\s+/);
      repaired.firstName = parts[0];
      repaired.lastName = parts.slice(1).join(' ');
    }
  }

  if (Array.isArray(repaired.skills)) {
    const uniqueSkills = new Set();
    for (const skill of repaired.skills) {
      if (typeof skill === 'string' && skill.trim().length > 1) {
        uniqueSkills.add(skill.trim());
      }
    }
    repaired.skills = Array.from(uniqueSkills);
  } else {
    repaired.skills = [];
  }

  if (!Array.isArray(repaired.workExperiences)) repaired.workExperiences = [];
  if (!Array.isArray(repaired.education)) repaired.education = [];

  return repaired;
}

/**
 * Hybrid Text + Multimodal Vision Resume Parser Engine
 */
async function parseResumeBuffer(bufferOrBase64, fileName = 'resume.pdf') {
  let buffer;
  let base64String;
  if (Buffer.isBuffer(bufferOrBase64)) {
    buffer = bufferOrBase64;
    base64String = bufferOrBase64.toString('base64');
  } else if (typeof bufferOrBase64 === 'string') {
    base64String = bufferOrBase64.replace(/^data:application\/pdf;base64,/, '');
    buffer = Buffer.from(base64String, 'base64');
  } else {
    throw new Error('Invalid input for PDF parsing');
  }

  const pdfData = typeof pdfParseLib === 'function' ? await pdfParseLib(buffer) : { text: '' };
  const rawText = pdfData.text || '';
  const quality = isReliablePdfText(rawText);

  console.log(`\n===============================================================`);
  console.log(`📄 [SERVER RESUME ENGINE] Starting PDF processing for: ${fileName}`);
  console.log(`===============================================================`);
  console.log(`[SERVER ENGINE LOG 1] Input Buffer/Base64 Size: ${base64String.length}`);
  console.log(`[SERVER ENGINE LOG 2] pdf-parse Extracted Text Length: ${rawText.length}`);
  console.log(`[SERVER ENGINE LOG 3] Extracted Text Snippet:\n"${rawText.substring(0, 300).replace(/\n/g, ' ')}..."`);
  console.log(`[SERVER ENGINE LOG 4] Quality Metrics:`, JSON.stringify(quality));
  console.log(`[SERVER ENGINE LOG 5] Server Gemini API Key configured: ${!!apiKey}`);

  const jsonSchemaPrompt = `
{
  "fullName": "Full Candidate Name",
  "firstName": "First Name",
  "lastName": "Last Name",
  "email": "candidate@example.com",
  "phone": "Phone Number",
  "location": "City, State or Country",
  "linkedinUrl": null,
  "portfolioUrl": null,
  "targetRole": "Candidate Title or Primary Role",
  "experienceYears": 5,
  "experienceLevel": "Entry-level | 1-3 years | 3+ years | 5+ years | 7+ years",
  "skills": ["Skill 1", "Skill 2"],
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
      "degree": "Degree / Certificate Name",
      "school": "Institution Name",
      "location": "Location",
      "year": "Dates / Graduation Year"
    }
  ]
}
`.trim();

  // Strategy 1: VISION Multimodal PDF Parsing
  if (apiKey) {
    console.log(`[SERVER ENGINE LOG 6] Invoking Server Gemini Multimodal PDF Vision Parser...`);
    try {
      const visionPrompt = `
You are an expert AI Resume Vision Parser. Visually inspect all pages of this candidate's resume PDF document and extract all structured profile details into JSON matching this exact schema:

${jsonSchemaPrompt}

CRITICAL VISION PARSING RULES:
1. READ THE RESUME VISUALLY: Read visible headings, candidate name, contact details, experiences, and skills directly from page layout.
2. IGNORE TEMPLATE BRANDING & METADATA: Ignore template names (e.g. Stockholm), decorative text, builder branding (e.g. "Build this template", "Resume Templates"), page numbers, or background icons.
3. DO NOT INVENT OR GUESS DATA: Only extract information actually visible in the resume document. If a field is missing, set it to null or empty array [].
4. EMAILS ARE NOT URLS: Never convert an email like email@email.com into https://email.com. Keep email in "email" field, and set portfolioUrl to null unless a real candidate website/portfolio URL is visible.
5. NO GENERIC TEMPLATE LINKS: Ignore generic links like https://www.linkedin.com/ unless it is the candidate's personal profile link.
6. NO CONFUSING FIELD CATEGORIES: Do NOT treat "Place of birth" as current candidate location. Do NOT treat "Driving license" as phone number. Do NOT treat hobbies as skills.
7. MULTI-PAGE RESUMES: Treat all pages as one continuous candidate resume. Keep separate work experience items and education items intact.
8. OUTPUT FORMAT: Return ONLY valid JSON matching the schema without markdown formatting.
`.trim();

      const visionPayload = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64String
                }
              },
              {
                text: visionPrompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      };

      const modelNames = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-exp'];
      let visionResponse = null;

      for (const model of modelNames) {
        try {
          console.log(`[SERVER ENGINE LOG 7] Trying Gemini Vision Endpoint for model: ${model}`);
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(visionPayload)
            }
          );
          if (res.ok) {
            console.log(`[SERVER ENGINE LOG 8] Gemini Vision Endpoint HTTP SUCCESS 200 for model ${model}!`);
            visionResponse = res;
            break;
          } else {
            const errBody = await res.text();
            console.log(`[SERVER ENGINE LOG 8-ERROR] Gemini Vision model ${model} HTTP ${res.status}:`, errBody);
          }
        } catch (mErr) {
          console.log(`[SERVER ENGINE LOG 8-EXC] Fetch exception for ${model}:`, mErr.message);
        }
      }

      if (visionResponse && visionResponse.ok) {
        const resData = await visionResponse.json();
        const candidateText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("===== RAW GEMINI VISION RESPONSE =====");
        console.log(candidateText || JSON.stringify(resData, null, 2));
        console.log("===== END GEMINI VISION RESPONSE =====");

        if (candidateText) {
          const cleanJsonStr = candidateText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          const aiParsed = JSON.parse(cleanJsonStr);
          return validateAndRepairParsedProfile(aiParsed);
        }
      }
    } catch (vErr) {
      console.log('Gemini Vision parsing error:', vErr.message);
    }
  }

  // Strategy 2: TEXT Gemini AI Parsing
  if (quality.isReliable && apiKey && rawText.trim().length > 20) {
    try {
      const textPrompt = `
You are an expert AI Resume Parser. Analyze the following raw text extracted from a candidate's resume PDF and extract all structured profile details into JSON matching this exact schema:

${jsonSchemaPrompt}

CRITICAL INSTRUCTIONS:
- Extract real values directly from text (e.g. Jason Miller, Amazon Associate, 3868683442, email@email.com, Los Angeles, CA).
- Return ONLY valid JSON without markdown formatting.

RESUME TEXT:
${rawText}
`.trim();

      console.log("===== TEXT SENT TO GEMINI =====");
      console.log(textPrompt);
      console.log("===== END GEMINI INPUT =====");

      const modelNames = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-2.0-flash-exp'];
      let response = null;

      for (const model of modelNames) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: textPrompt }] }],
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
          return validateAndRepairParsedProfile(aiParsed);
        }
      }
    } catch (aiErr) {
      console.error('Gemini AI text parsing failed:', aiErr.message);
    }
  }

  // Strategy 3: Rule-Based Fallback Engine
  const lines = rawText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0 && !METADATA_BLACKLIST.test(l));

  let email;
  const emailMatch = rawText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) email = emailMatch[1].toLowerCase();

  let phone;
  const phoneMatch = rawText.match(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  if (phoneMatch) phone = phoneMatch[0].trim();

  let linkedinUrl;
  const linkedinMatch = rawText.match(/(linkedin\.com\/in\/[a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) linkedinUrl = `https://${linkedinMatch[1]}`;

  let portfolioUrl;
  const githubMatch = rawText.match(/(github\.com\/[a-zA-Z0-9_-]+)/i);
  if (githubMatch) portfolioUrl = `https://${githubMatch[1]}`;

  let location;
  const locMatch = rawText.match(/\b([A-Za-z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?)\b/i) ||
                    rawText.match(/\b([A-Z][a-zA-Z\s]+,\s*(?:Turkey|France|UAE|Dubai|United States|USA|UK|Canada|Germany|Iran|Spain|Italy|Remote))\b/i);
  if (locMatch) location = locMatch[1].trim();

  let fullName;
  let firstName;
  let lastName;
  let targetRole;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];
    if (METADATA_BLACKLIST.test(line)) continue;

    if (!line.includes('@') && !line.includes('http') && !line.includes('www') && !/\d/.test(line)) {
      if (!/resume|curriculum|vitae|page|profile|work|experience|skills|education|contact/i.test(line)) {
        if (JOB_TITLE_KEYWORDS.test(line)) {
          if (!targetRole) targetRole = line.trim();
        } else if (!fullName && (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line) || /^[A-Za-z\s.'-]{3,35}$/.test(line))) {
          fullName = line.trim();
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

  const rawParsed = {
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

  return validateAndRepairParsedProfile(rawParsed);
}

module.exports = { parseResumeBuffer, isReliablePdfText, validateAndRepairParsedProfile };
