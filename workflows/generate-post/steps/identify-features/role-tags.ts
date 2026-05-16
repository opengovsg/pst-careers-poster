export type RoleTag = {
  name: string
  patterns: RegExp[]
}

/**
 * Canonical role tags used to derive the "trending job title" feature without
 * an LLM. A listing is considered to belong to a tag if its jobTitle matches
 * any of the tag's patterns (case-insensitive). A single listing can match
 * multiple tags (e.g. "AI Data Scientist" matches both "Data Scientist" and
 * "AI Engineer") — counts are per tag, so this is fine.
 *
 * Patterns are anchored on word boundaries to avoid partial-word false
 * positives. When adding a new tag, prefer specific multi-word phrases over
 * single common words (e.g. "data engineer" rather than just "data").
 */
export const ROLE_TAGS: RoleTag[] = [
  { name: 'Cybersecurity Specialist', patterns: [/\bcyber ?security\b/i, /\binfosec\b/i, /\binformation security\b/i, /\bcyber (?:intelligence|threat|capability|specialist|analyst|researcher|operations?|engineering|analytics|forensics?|crime|crisis|readiness)\b/i] },
  { name: 'Software Engineer', patterns: [/\bsoftware engineer(?:s|ing)?\b/i, /\bsoftware developers?\b/i, /\bapplication developers?\b/i, /\bbackend engineers?\b/i, /\bfull[- ]?stack engineers?\b/i] },
  { name: 'Frontend Engineer', patterns: [/\bfront[- ]?end engineers?\b/i] },
  { name: 'Product Manager', patterns: [/\bproduct managers?\b/i, /\bproduct management\b/i, /\bproduct owners?\b/i] },
  { name: 'Data Scientist', patterns: [/\bdata scientists?\b/i, /\bdata science\b/i] },
  { name: 'Data Engineer', patterns: [/\bdata engineer(?:s|ing)?\b/i] },
  { name: 'Data Analyst', patterns: [/\bdata analysts?\b/i, /\bdata analytics\b/i] },
  { name: 'AI Engineer', patterns: [/\bai engineers?\b/i, /\bartificial intelligence engineers?\b/i, /\bml engineers?\b/i, /\bmachine learning engineers?\b/i] },
  { name: 'AI Researcher', patterns: [/\bai researchers?\b/i, /\bai research\b/i] },
  { name: 'MLOps Engineer', patterns: [/\bml ?ops\b/i, /\bai ?ops\b/i] },
  { name: 'Vulnerability Researcher', patterns: [/\bvulnerability research(?:er)?s?\b/i, /\bsecurity research(?:er)?s?\b/i] },
  { name: 'Application Security Engineer', patterns: [/\bapplication security\b/i, /\bappsec\b/i] },
  { name: 'Digital Forensics Specialist', patterns: [/\bdigital forensics?\b/i, /\bforensic investigators?\b/i] },
  { name: 'UX Designer', patterns: [/\bux designers?\b/i, /\buser experience\b/i, /\bproduct designers?\b/i, /\binteraction designers?\b/i] },
  { name: 'Systems Analyst', patterns: [/\bsystems? analysts?\b/i] },
  { name: 'Business Analyst', patterns: [/\bbusiness analysts?\b/i] },
  { name: 'Cloud Engineer', patterns: [/\bcloud engineers?\b/i, /\bcloud architects?\b/i, /\bcloud (?:infrastructure|platform|operations)\b/i] },
  { name: 'DevOps Engineer', patterns: [/\bdevops\b/i, /\bsite reliability\b/i, /\bsre\b/i, /\bplatform engineers?\b/i] },
  { name: 'Solutions Architect', patterns: [/\bsolutions? architects?\b/i] },
  { name: 'Network Engineer', patterns: [/\bnetwork engineers?\b/i, /\bnetwork architects?\b/i] },
  { name: 'IT Infrastructure Engineer', patterns: [/\b(?:it|ict) infrastructure\b/i, /\binfrastructure engineers?\b/i] },
  { name: 'Database Administrator', patterns: [/\bdatabase administrators?\b/i, /\bdba\b/i] },
  { name: 'IT Project Manager', patterns: [/\b(?:it|ict|tech(?:nology)?) project managers?\b/i] },
  { name: 'IT Lecturer', patterns: [/\blecturer\b.*\b(?:it|ict|informatics|cyber|software|data|technolog|security|computing)\b/i, /\b(?:cyber|informatics) lecturer\b/i] },
  { name: 'Quality Assurance Engineer', patterns: [/\bquality assurance\b/i, /\bqa engineers?\b/i, /\btest(?:ing)? engineers?\b/i, /\bsoftware testers?\b/i] },
  { name: 'Digital Transformation', patterns: [/\bdigital transformation\b/i, /\bdigital strategy\b/i] },
]
