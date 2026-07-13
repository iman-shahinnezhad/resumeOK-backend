const SKILL_PATTERNS = {
  'React': /\breact(?:\.js)?\b/i,
  'Next.js': /\bnext(?:\.js|js)?\b/i,
  'Vue': /\bvue(?:\.js|js)?\b/i,
  'Angular': /\bangular(?:\.js|js)?\b/i,
  'Node.js': /\bnode(?:\.js|js)?\b/i,
  'Python': /\bpython\b/i,
  'Go': /\bgolang\b/i,
  'Go (lang)': /\bGo\b/, // Case-sensitive boundary to avoid false matching common "go" word
  'Java': /\bjava\b/i,
  'Rust': /\brust\b/i,
  'AWS': /\baws\b|\bamazon web services\b/i,
  'Azure': /\bazure\b/i,
  'Docker': /\bdocker\b/i,
  'Kubernetes': /\bkubernetes\b|\bk8s\b/i,
  'Terraform': /\bterraform\b/i,
  'PostgreSQL': /\bpostgresql\b|\bpostgres\b/i,
  'MongoDB': /\bmongodb\b|\bmongo\b/i,
  'Redis': /\bredis\b/i,
  'GraphQL': /\bgraphql\b/i,
  'LLMs': /\bllms?\b|\blarge language models?\b/i,
  'RAG': /\brags?\b|\bretrieval[- ]augmented generation\b/i,
  'LangChain': /\blangchain\b/i
};

/**
 * Extracts normalized skills from text.
 * @param {string} title
 * @param {string} description
 * @param {string} requirements
 * @returns {Array<string>} List of identified skills.
 */
function extractSkills(title = '', description = '', requirements = '') {
  const combinedText = `${title} ${description} ${requirements}`;
  const skills = [];

  for (const [skillName, pattern] of Object.entries(SKILL_PATTERNS)) {
    if (pattern.test(combinedText)) {
      const normalizedName = skillName.startsWith('Go') ? 'Go' : skillName;
      if (!skills.includes(normalizedName)) {
        skills.push(normalizedName);
      }
    }
  }

  return skills;
}

module.exports = {
  extractSkills
};
