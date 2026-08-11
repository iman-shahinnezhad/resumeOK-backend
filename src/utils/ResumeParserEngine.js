const pdfParse = require('pdf-parse');

const KNOWN_SKILLS = [
  'React', 'React Native', 'TypeScript', 'JavaScript', 'Node.js', 'Express', 'Python', 'Django', 'Flask',
  'Java', 'Spring Boot', 'C++', 'C#', '.NET', 'Go', 'Golang', 'Rust', 'PHP', 'Laravel', 'Ruby', 'Rails',
  'HTML', 'HTML5', 'CSS', 'CSS3', 'Sass', 'Tailwind', 'TailwindCSS', 'Bootstrap', 'Redux', 'Zustand',
  'Next.js', 'Vite', 'Vue.js', 'Angular', 'GraphQL', 'REST API', 'WebSockets', 'SQL', 'PostgreSQL',
  'MySQL', 'MongoDB', 'Redis', 'Firebase', 'Supabase', 'SQLite', 'Docker', 'Kubernetes', 'AWS', 'GCP',
  'Azure', 'DevOps', 'CI/CD', 'Git', 'GitHub', 'GitLab', 'Linux', 'Bash', 'Jira', 'Agile', 'Scrum',
  'Figma', 'UI/UX', 'Product Management', 'Project Management', 'Data Analysis', 'Machine Learning',
  'Artificial Intelligence', 'TensorFlow', 'PyTorch', 'System Architecture', 'Microservices', 'Unit Testing',
  'Jest', 'Cypress', 'Mobile Development', 'iOS', 'Swift', 'Android', 'Kotlin', 'Flutter'
];

const ROLE_KEYWORDS = [
  'Software Engineer', 'Senior Software Engineer', 'Full Stack Developer', 'Frontend Developer',
  'Backend Developer', 'Mobile Engineer', 'React Native Developer', 'iOS Developer', 'Android Developer',
  'DevOps Engineer', 'Data Scientist', 'Data Engineer', 'Machine Learning Engineer', 'UI/UX Designer',
  'Product Designer', 'Product Manager', 'Project Manager', 'Scrum Master', 'QA Engineer', 'Solution Architect'
];

/**
 * Parses raw PDF buffer or Base64 string and extracts clean, structured personal profile data.
 */
async function parseResumeBuffer(bufferOrBase64, fileName = 'resume.pdf') {
  let buffer;
  if (Buffer.isBuffer(bufferOrBase64)) {
    buffer = bufferOrBase64;
  } else if (typeof bufferOrBase64 === 'string') {
    // Strip Data URL prefix if present
    const base64Data = bufferOrBase64.replace(/^data:application\/pdf;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    throw new Error('Invalid input for PDF parsing');
  }

  const pdfData = await pdfParse(buffer);
  const rawText = pdfData.text || '';
  const lines = rawText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);

  // 1. Email Extraction
  let email;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = rawText.match(emailRegex);
  if (emailMatch) {
    email = emailMatch[1].toLowerCase();
  }

  // 2. Phone Extraction
  let phone;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const phoneMatch = rawText.match(phoneRegex);
  if (phoneMatch) {
    phone = phoneMatch[0].trim();
  }

  // 3. Social & Portfolio Links
  let linkedinUrl;
  const linkedinMatch = rawText.match(/(linkedin\.com\/in\/[a-zA-Z0-9_-]+)/i);
  if (linkedinMatch) {
    linkedinUrl = `https://${linkedinMatch[1]}`;
  }

  let portfolioUrl;
  const githubMatch = rawText.match(/(github\.com\/[a-zA-Z0-9_-]+)/i);
  if (githubMatch) {
    portfolioUrl = `https://${githubMatch[1]}`;
  } else {
    const siteMatch = rawText.match(/(https?:\/\/)?([a-zA-Z0-9_-]+\.(?:io|me|dev|com|app))/i);
    if (siteMatch && !siteMatch[2].includes('linkedin') && !siteMatch[2].includes('google')) {
      portfolioUrl = siteMatch[0].startsWith('http') ? siteMatch[0] : `https://${siteMatch[2]}`;
    }
  }

  // 4. Location Extraction
  let location;
  const locMatch = rawText.match(/\b([A-Z][a-zA-Z\s]+,\s*(?:[A-Z]{2}|Turkey|France|UAE|Dubai|United States|USA|UK|Canada|Germany|Iran|Spain|Italy|Remote))\b/i);
  if (locMatch) {
    location = locMatch[1].trim();
  }

  // 5. Full Name & Role Extraction
  let fullName;
  let firstName;
  let lastName;
  let targetRole;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (!line.includes('@') && !line.includes('http') && !line.includes('www') && !/\d/.test(line)) {
      if (!/resume|curriculum|vitae|page|profile|work|experience|skills|education|contact/i.test(line)) {
        if (!fullName && /^[A-Za-z\s.'-]{3,35}$/.test(line)) {
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

  // Fallback Name from Email
  if (!fullName && email) {
    const handle = email.split('@')[0];
    const namePart = handle.replace(/[^a-zA-Z]/g, ' ').trim();
    if (namePart.length >= 3) {
      const parts = namePart.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
      fullName = parts.join(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }
  }

  // Fallback Role search
  if (!targetRole) {
    for (const rKey of ROLE_KEYWORDS) {
      if (new RegExp(`\\b${rKey}\\b`, 'i').test(rawText)) {
        targetRole = rKey;
        break;
      }
    }
  }

  // 6. Skills Extraction
  const foundSkills = new Set();
  for (const skill of KNOWN_SKILLS) {
    const esc = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${esc}(?:$|[^a-zA-Z0-9])`, 'i');
    if (regex.test(rawText)) {
      foundSkills.add(skill);
    }
  }
  const skills = Array.from(foundSkills);

  // 7. Experience Level Calculation
  let experienceYears = 0;
  let experienceLevel = '3+ years';
  const yearMatches = rawText.match(/\b(19\d\d|20\d\d)\b/g);
  if (yearMatches && yearMatches.length >= 2) {
    const numericYears = yearMatches.map(Number).filter(y => y <= new Date().getFullYear());
    if (numericYears.length >= 2) {
      const minYr = Math.min(...numericYears);
      const maxYr = Math.max(...numericYears);
      experienceYears = maxYr - minYr;
    }
  }
  if (experienceYears >= 7) experienceLevel = '7+ years';
  else if (experienceYears >= 5) experienceLevel = '5+ years';
  else if (experienceYears >= 3) experienceLevel = '3+ years';
  else if (experienceYears >= 1) experienceLevel = '1-3 years';
  else experienceLevel = 'Entry-level';

  // 8. Work Experience Extraction
  const workExperiences = [];
  const expSectionMatch = rawText.match(/(?:work\s+experience|professional\s+experience|employment\s+history|experience)([\s\S]*?)(?:education|skills|certifications|projects|$)/i);
  if (expSectionMatch) {
    const expText = expSectionMatch[1];
    const expLines = expText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
    let currentExp = null;
    for (const eline of expLines) {
      if (eline.length > 5 && eline.length < 60 && !eline.startsWith('•') && !eline.startsWith('-')) {
        if (currentExp && currentExp.title) {
          workExperiences.push(currentExp);
        }
        currentExp = {
          title: eline,
          company: 'Company',
          dates: '2021 - Present',
          description: ''
        };
      } else if (currentExp) {
        currentExp.description += (currentExp.description ? ' ' : '') + eline;
      }
    }
    if (currentExp && currentExp.title) workExperiences.push(currentExp);
  }

  // 9. Education Extraction
  const education = [];
  const eduSectionMatch = rawText.match(/(?:education|academic\s+background)([\s\S]*?)(?:skills|certifications|projects|work|$)/i);
  if (eduSectionMatch) {
    const eduText = eduSectionMatch[1];
    const eduLines = eduText.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
    for (const edline of eduLines) {
      if (edline.length > 5 && (edline.includes('University') || edline.includes('College') || edline.includes('Bachelor') || edline.includes('Master') || edline.includes('B.S.') || edline.includes('M.S.'))) {
        education.push({
          degree: edline.includes('Master') || edline.includes('M.S.') ? 'Master of Science' : 'Bachelor of Science',
          school: edline,
          year: '2020'
        });
      }
    }
  }

  return {
    fullName: fullName || 'User',
    firstName: firstName || (fullName ? fullName.split(' ')[0] : 'User'),
    lastName: lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : ''),
    email: email || 'user@example.com',
    phone: phone || '',
    location: location || 'United States',
    linkedinUrl: linkedinUrl || '',
    portfolioUrl: portfolioUrl || '',
    targetRole: targetRole || 'Software Engineer',
    experienceYears,
    experienceLevel,
    skills: skills.length > 0 ? skills : ['JavaScript', 'React', 'Problem Solving'],
    workExperiences: workExperiences.slice(0, 3),
    education: education.slice(0, 2),
    rawTextPreview: rawText.slice(0, 300)
  };
}

module.exports = { parseResumeBuffer };
