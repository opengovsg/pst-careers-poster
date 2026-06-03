import { generateText } from 'ai'
import { model } from '../../shared'
import { disciplineOf, OTHER_ROLES_HEADING } from './identify-features/role-tags'

// Two-call (rank then write) architecture with an integer row-ID frame.
// Rationale, alternatives, and consequences: docs/adr/0003-two-call-generate-content.md.

const LISTINGS_SYSTEM =
  'You select roles from a list of Singapore Public Service IT job openings for inclusion in a LinkedIn careers post about a specific topic. Each candidate role has a numeric id. Optimise for: title legibility (a LinkedIn scroller should recognise the role at a glance), agency diversity (cap ~3 per agency), seniority spread (mix junior, mid, senior), and dedup of near-identical titles within the same agency. Pick 6-10 roles. Output exactly one numeric id per line — just the integer, nothing else. No titles, no URLs, no prose, no preamble, no closing remarks, no markdown, no headers.'

const INTRO_SYSTEM =
  `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Style: direct and grounded. Short sentences. Vary length for rhythm. No buzzwords, no markdown, no asterisks, no bullet points. Write like a sharp journalist, not a recruiter.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Name something specific about this work. Do not open with "I", do not open with a compliment or affirmation.

Second paragraph: expand on what kind of work this actually is, or who would thrive here. Be concrete. No call-to-action, no role listing — those are added separately.`

const BOILERPLATE_ROLE_INTRO = 'Look out for these roles:'
const BOILERPLATE_CLOSING = 'Visit go.gov.sg/pst-roles for other tech roles! #hiring'

// Floor check: the listings prompt asks for 6-10 roles. If a sampling produces
// fewer than RANKING_FLOOR valid ids after dedup + range validation, re-roll
// once. Take the best-of-N (most ids) across attempts; throw only if every
// attempt yields zero.
const RANKING_FLOOR = 6
const RANKING_MAX_ATTEMPTS = 2

export async function generateContent(feature: string, jobs: Record<string, string>[], featureType: 'job title' | 'agency' | 'trend'): Promise<string> {
  'use step'

  // Trend mode: the feature string is already a 1-2 sentence narrative
  // produced by identifyFeatures (combining headline + rationale). It serves
  // directly as the post's intro, so we skip both the title template and the
  // INTRO_SYSTEM call. Listings ranking still runs — the trend identification
  // returned 4-12 candidates and the ranker enforces dedup, agency diversity,
  // and seniority spread regardless of feature source.
  const title = featureType === 'agency'
    ? `${feature} is hiring across its tech teams.`
    : featureType === 'job title'
      ? `${feature} roles across the Singapore Public Service.`
      : null

  const listingsCsv = [
    'id,jobTitle,agency,remainingDays,experienceYearsMin,experienceYearsMax',
    ...jobs.map((job, i) =>
      [i + 1, job.jobTitle, job.agency, job.remainingDays, job.experienceYearsMin, job.experienceYearsMax]
        .map(value => `"${`${value ?? ''}`.replace(/"/g, '""')}"`)
        .join(','),
    ),
  ].join('\n')

  const idToRow = new Map<number, Record<string, string>>()
  jobs.forEach((job, i) => idToRow.set(i + 1, job))

  const rankingPrompt = `Feature: ${feature}

Candidate roles (CSV; the leading "id" column is the integer you will return):
${listingsCsv}

Select and order the 6-10 best roles for a LinkedIn post about "${feature}". Output exactly one numeric id per line, no other text.`

  const parseRanking = (text: string) => {
    const seen = new Set<number>()
    const out: { id: number, row: Record<string, string> }[] = []
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      const m = line.match(/^[\s\-*[\]]*(\d{1,4})\b/)
      if (!m) continue
      const id = parseInt(m[1], 10)
      if (!idToRow.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push({ id, row: idToRow.get(id)! })
    }
    return out
  }

  let ranked: { id: number, row: Record<string, string> }[] = []
  let lastRawText = ''
  for (let attempt = 1; attempt <= RANKING_MAX_ATTEMPTS; attempt++) {
    const rankRes = await generateText({
      model,
      maxOutputTokens: 8192,
      temperature: 0.7,
      system: LISTINGS_SYSTEM,
      prompt: rankingPrompt,
    })
    lastRawText = rankRes.text
    const parsed = parseRanking(rankRes.text)
    if (parsed.length > ranked.length) ranked = parsed
    if (ranked.length >= RANKING_FLOOR) break
  }

  if (ranked.length === 0) {
    throw new Error(`generateContent: no valid listing IDs parsed across ${RANKING_MAX_ATTEMPTS} attempts (last raw text: ${lastRawText.slice(0, 200)})`)
  }

  const introText = featureType === 'trend'
    ? feature
    : (await generateText({
        model,
        maxOutputTokens: 8192,
        temperature: 0.7,
        system: INTRO_SYSTEM,
        prompt: `Feature: ${feature}

Roles featured in this post (title — agency):
${ranked.map(({ row }) => `- ${row.jobTitle} — ${row.agency}`).join('\n')}

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.`,
      })).text

  // Section headings depend on the feature:
  // - 'job title': one discipline spanning many agencies — group by agency.
  // - 'agency': one agency spanning many disciplines — group by discipline
  //   (disciplineOf reuses the same role-tag matcher as feature selection).
  // - 'trend': spans many agencies and disciplines. Grouping by discipline
  //   bunches together near-identical titles that differ only by team name,
  //   which disorients the reader; grouping by agency gives a navigable
  //   hierarchy (agency -> title + team). A single-agency trend collapses to a
  //   flat, heading-less list, which is acceptable.
  const groupOf = featureType === 'agency'
    ? (row: Record<string, string>) => disciplineOf(row)
    : (row: Record<string, string>) => row.agency

  // Sections ordered by count desc, ties broken by the model's first-pick order
  // (Map preserves insertion order; Array.sort is stable since ES2019). The
  // OTHER_ROLES_HEADING catch-all always sorts last regardless of count — it's a
  // residual bucket, so it reads as a footer rather than a peer discipline.
  const byGroup = new Map<string, typeof ranked>()
  for (const r of ranked) {
    const key = groupOf(r.row)
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key)!.push(r)
  }
  // When everything lands in one group (e.g. an 'agency' run where all picks
  // share a discipline, or a 'trend' that collapsed to a single role type),
  // drop the redundant heading and emit a flat bullet list.
  const listingsBlock = byGroup.size === 1
    ? ranked.map(({ row }) => `- ${row.jobTitle} - ${row.url}`).join('\n')
    : Array.from(byGroup.entries())
        .sort((a, b) => {
          const aOther = a[0] === OTHER_ROLES_HEADING
          const bOther = b[0] === OTHER_ROLES_HEADING
          if (aOther !== bOther) return aOther ? 1 : -1
          return b[1].length - a[1].length
        })
        .map(([heading, items]) =>
          `${heading}\n${items.map(({ row }) => `- ${row.jobTitle} - ${row.url}`).join('\n')}`,
        )
        .join('\n\n')

  const header = title ? `${title}\n\n${introText.trim()}` : introText.trim()
  const assembled = `${header}\n\n${BOILERPLATE_ROLE_INTRO}\n\n${listingsBlock}\n\n${BOILERPLATE_CLOSING}`

  // Escape parens: the post is submitted to a Fillout form that forwards to
  // LinkedIn, which treats unescaped parens as link syntax. Titles like
  // "Government Technology Agency (GovTech)" would otherwise mangle.
  return assembled.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}
