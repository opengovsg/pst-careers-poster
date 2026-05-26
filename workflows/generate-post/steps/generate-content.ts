import { generateText } from 'ai'
import { model } from '../../shared'

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

const BOILERPLATE_CLOSING = 'Visit go.gov.sg/pst-roles for other tech roles! #hiring'

// Floor check: the listings prompt asks for 6-10 roles. If a sampling produces
// fewer than RANKING_FLOOR valid ids after dedup + range validation, re-roll
// once. Take the best-of-N (most ids) across attempts; throw only if every
// attempt yields zero.
const RANKING_FLOOR = 6
const RANKING_MAX_ATTEMPTS = 2

export async function generateContent(feature: string, jobs: Record<string, string>[]): Promise<string> {
  'use step'

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

  const introRes = await generateText({
    model,
    maxOutputTokens: 8192,
    temperature: 0.7,
    system: INTRO_SYSTEM,
    prompt: `Feature: ${feature}

Roles featured in this post (title — agency):
${ranked.map(({ row }) => `- ${row.jobTitle} — ${row.agency}`).join('\n')}

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.`,
  })

  // Group by agency, sections ordered by count desc, ties broken by the
  // model's first-pick order (Map preserves insertion order; Array.sort is
  // stable since ES2019).
  const byAgency = new Map<string, typeof ranked>()
  for (const r of ranked) {
    if (!byAgency.has(r.row.agency)) byAgency.set(r.row.agency, [])
    byAgency.get(r.row.agency)!.push(r)
  }
  // When all selected listings belong to one agency (any 'agency'-feature run,
  // and the occasional role-tag run where all picks happen to share an agency),
  // drop the redundant agency header and emit a flat bullet list.
  const listingsBlock = byAgency.size === 1
    ? ranked.map(({ row }) => `- ${row.jobTitle} - ${row.url}`).join('\n')
    : Array.from(byAgency.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(([agency, items]) =>
          `${agency}\n${items.map(({ row }) => `- ${row.jobTitle} - ${row.url}`).join('\n')}`,
        )
        .join('\n\n')

  const assembled = `${introRes.text.trim()}\n\n${listingsBlock}\n\n${BOILERPLATE_CLOSING}`

  // Escape parens: the post is submitted to a Fillout form that forwards to
  // LinkedIn, which treats unescaped parens as link syntax. Titles like
  // "Government Technology Agency (GovTech)" would otherwise mangle.
  return assembled.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}
