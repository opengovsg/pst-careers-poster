export type RoleTag = {
  name: string
  patterns: RegExp[]
}

/**
 * Canonical role tags used to derive the "trending job title" feature without
 * an LLM, and to group listings under discipline headings in the content post
 * (see `disciplineOf`). A listing is considered to belong to a tag if
 * `matchesRoleTag` returns true (jobTitle match, or REQ_HIT_THRESHOLD+ keyword
 * hits in jobRequirements).
 *
 * Array ORDER IS LOAD-BEARING. For feature *counting* (the 'job title' branch
 * in identify-features) a listing may match several tags and each is counted
 * independently, so order is irrelevant there. But `disciplineOf` assigns a
 * listing to its FIRST matching tag for grouping, so a multi-tag listing
 * (e.g. "AI Data Scientist" matches both "Data Science" and "AI Engineering")
 * is filed under whichever appears earlier in this array. Order entries by the
 * precedence you want headings to take.
 *
 * Patterns are anchored on word boundaries to avoid partial-word false
 * positives. When adding a new tag, prefer specific multi-word phrases over
 * single common words (e.g. "data engineer" rather than just "data").
 */
export const ROLE_TAGS: RoleTag[] = [
  { name: 'Cybersecurity', patterns: [/\bcyber ?security\b/i, /\binfosec\b/i, /\binformation security\b/i, /\bcyber (?:intelligence|threat|capability|specialist|analyst|researcher|operations?|engineering|analytics|forensics?|crime|crisis|readiness)\b/i] },
  { name: 'Software Engineering', patterns: [/\bsoftware engineer(?:s|ing)?\b/i, /\bsoftware developers?\b/i, /\bapplication developers?\b/i, /\bbackend engineers?\b/i, /\bfull[- ]?stack engineers?\b/i] },
  { name: 'Frontend Engineering', patterns: [/\bfront[- ]?end engineers?\b/i] },
  { name: 'Product Management', patterns: [/\bproduct managers?\b/i, /\bproduct management\b/i, /\bproduct owners?\b/i] },
  { name: 'Data Science', patterns: [/\bdata scientists?\b/i, /\bdata science\b/i] },
  { name: 'Data Engineering', patterns: [/\bdata engineer(?:s|ing)?\b/i] },
  { name: 'Data Analytics', patterns: [/\bdata analysts?\b/i, /\bdata analytics\b/i] },
  { name: 'AI Engineering', patterns: [/\bai engineers?\b/i, /\bartificial intelligence engineers?\b/i, /\bml engineers?\b/i, /\bmachine learning engineers?\b/i] },
  { name: 'AI Research', patterns: [/\bai researchers?\b/i, /\bai research\b/i] },
  { name: 'MLOps Engineering', patterns: [/\bml ?ops\b/i, /\bai ?ops\b/i] },
  { name: 'Vulnerability Research', patterns: [/\bvulnerability research(?:er)?s?\b/i, /\bsecurity research(?:er)?s?\b/i] },
  { name: 'Application Security Engineering', patterns: [/\bapplication security\b/i, /\bappsec\b/i] },
  { name: 'Digital Forensics', patterns: [/\bdigital forensics?\b/i, /\bforensic investigators?\b/i] },
  { name: 'UX Design', patterns: [/\bux designers?\b/i, /\buser experience\b/i, /\bproduct designers?\b/i, /\binteraction designers?\b/i] },
  { name: 'Systems Analysis', patterns: [/\bsystems? analysts?\b/i] },
  { name: 'Business Analysis', patterns: [/\bbusiness analysts?\b/i] },
  { name: 'Cloud Engineering', patterns: [/\bcloud engineers?\b/i, /\bcloud architects?\b/i, /\bcloud (?:infrastructure|platform|operations)\b/i] },
  { name: 'DevOps', patterns: [/\bdevops\b/i, /\bsite reliability\b/i, /\bsre\b/i, /\bplatform engineers?\b/i] },
  { name: 'Solutions Architecture', patterns: [/\bsolutions? architects?\b/i] },
  { name: 'Network Engineering', patterns: [/\bnetwork engineers?\b/i, /\bnetwork architects?\b/i] },
  { name: 'IT Infrastructure', patterns: [/\b(?:it|ict) infrastructure\b/i, /\binfrastructure engineers?\b/i] },
  { name: 'Database Administration', patterns: [/\bdatabase administrators?\b/i, /\bdba\b/i] },
  { name: 'IT Project Management', patterns: [/\b(?:it|ict|tech(?:nology)?) project managers?\b/i] },
  { name: 'IT Education', patterns: [/\blecturer\b.*\b(?:it|ict|informatics|cyber|software|data|technolog|security|computing)\b/i, /\b(?:cyber|informatics) lecturer\b/i] },
  { name: 'Quality Assurance', patterns: [/\bquality assurance\b/i, /\bqa engineers?\b/i, /\btest(?:ing)? engineers?\b/i, /\bsoftware testers?\b/i] },
  { name: 'Digital Transformation', patterns: [/\bdigital transformation\b/i, /\bdigital strategy\b/i] },
]

/**
 * Fallback heading for listings that match no ROLE_TAG (IT-industry listings
 * with generic titles, surfaced by the union filter in findFeature).
 */
export const OTHER_ROLES_HEADING = 'Other Roles'

/**
 * A listing qualifies for a role tag if its title matches, OR its requirements
 * field contains at least this many keyword hits. A single hit in requirements
 * is almost always incidental ("basic knowledge of cybersecurity" in a
 * non-cyber role); the threshold rejects those while still catching roles
 * where the tag is genuinely a focus area but the title is generic.
 */
const REQ_HIT_THRESHOLD = 2

/** Strip HTML tags and named entities to plain text for keyword scanning. */
export function stripHtml(text: string | undefined): string {
  return (text ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, pattern) => {
    const global = pattern.flags.includes('g')
      ? pattern
      : new RegExp(pattern.source, pattern.flags + 'g')
    return sum + (text.match(global)?.length ?? 0)
  }, 0)
}

/**
 * Whether a listing belongs to a role tag: true if its jobTitle matches any of
 * the tag's patterns, or its jobRequirements has REQ_HIT_THRESHOLD+ keyword
 * hits. The single source of truth for "belongs to discipline X", shared by
 * feature selection and content grouping.
 */
export function matchesRoleTag(job: Record<string, string>, tag: RoleTag): boolean {
  if (tag.patterns.some(pattern => pattern.test(job.jobTitle))) return true
  return countMatches(stripHtml(job.jobRequirements), tag.patterns) >= REQ_HIT_THRESHOLD
}

/**
 * The discipline heading a listing is grouped under in the content post. Uses
 * first-match against ROLE_TAGS (order is load-bearing — see ROLE_TAGS doc),
 * falling back to OTHER_ROLES_HEADING.
 */
export function disciplineOf(job: Record<string, string>): string {
  return ROLE_TAGS.find(tag => matchesRoleTag(job, tag))?.name ?? OTHER_ROLES_HEADING
}
