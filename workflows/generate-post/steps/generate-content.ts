import { generateText } from 'ai'
import { model } from '../../shared'
import { disciplineOf, OTHER_ROLES_HEADING, stripHtml } from './identify-features/role-tags'

// Two-call (rank then write) architecture with an integer row-ID frame.
// Rationale, alternatives, and consequences: docs/adr/0003-two-call-generate-content.md.

const LISTINGS_SYSTEM =
  'You select roles from a list of Singapore Public Service IT job openings for inclusion in a LinkedIn careers post about a specific topic. Each candidate role has a numeric id. Optimise for: title legibility (a LinkedIn scroller should recognise the role at a glance), agency diversity (cap ~3 per agency), seniority spread (mix junior, mid, senior), and dedup of near-identical titles within the same agency. Pick 6-10 roles. Output exactly one numeric id per line — just the integer, nothing else. No titles, no URLs, no prose, no preamble, no closing remarks, no markdown, no headers.'

const INTRO_SYSTEM =
  `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Voice: write like a curious engineer telling a peer about something genuinely interesting they just ran into. A little warmth and energy is good and wanted — it should sound like a person who finds this work cool, not a press release. The warmth comes from the substance being genuinely interesting, never from adjectives. What is banned is sales talk: hype words (exciting, cutting-edge, world-class, dynamic, passionate, transformative), "join us", "make an impact", and anything that reads like a job ad. No markdown, no asterisks, no bullet points. Vary sentence length for rhythm.

Grounding: you are given each agency's own description and a summary of what each role involves, written in dull, bureaucratic language. Find the real substance buried in them — the systems, tools, domains, and who the work serves. Keep precise technical terms exactly as written (named systems, tools, methods, and domains — e.g. "MLOps", "computer vision", "RAG"); those ARE the substance and must survive into your hook. What you must not reuse is the dull sentence structure and bureaucratic framing — supply your own. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Anchor: this is the Singapore public service, and the hook must make that unmistakable. Each agency's own description tells you its public mission and who it exists to serve — drawn only from the descriptions you are given, make clear what public purpose this work is for. Ground the stakes in that mission, re-voiced in your own words and never quoted; never invent a public purpose the descriptions do not state. For a single agency that is its mission; across several it is the public outcomes they share.

Focus: a headline stating the breadth of roles is added separately, so do not try to summarise or survey everything the roles do — a list of everything reads as flat. Pick the one or two most concrete and vivid threads and lead with them. One sharp, real detail beats a complete catalogue.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Your first sentence must set up the hook as a complete thought — the stakes, who the work is for, the situation, or the problem — and it must not name any tool, system, or technical term. Vary how you open: do not reflexively reach for an "X is easy but Y is hard" or "X is one thing, Y is another" contrast; that framing is becoming a tic. Save every specific (named systems, tools, methods, domains) for the second sentence onward. Do not open with "I", and do not open with a compliment or affirmation.

Second paragraph: go deeper on that same thread — what makes the problem hard, or what the work touches and who it serves. Stay concrete and specific. No call-to-action, no role listing — those are added separately.`

const BOILERPLATE_ROLE_INTRO = 'Look out for these roles:'
const BOILERPLATE_CLOSING = 'Visit go.gov.sg/pst-roles for other tech roles! #hiring'

// Floor check: the listings prompt asks for 6-10 roles. If a sampling produces
// fewer than RANKING_FLOOR valid ids after dedup + range validation, re-roll
// once. Take the best-of-N (most ids) across attempts; throw only if every
// attempt yields zero.
const RANKING_FLOOR = 6
const RANKING_MAX_ATTEMPTS = 2

// Intro-call substrate. jobResponsibilities is the most fact-dense field (named
// systems, tools, domains); its concrete lead sits in the first few hundred
// chars. agencyDescription is the agency's own self-description — the safe,
// sourced substitute for the model's parametric knowledge, which matters most
// for low-profile intel/security agencies it shouldn't guess about. Both are
// truncated to keep the enriched prompt bounded across 6-10 roles.
const RESP_SNIPPET_CHARS = 500
const AGENCY_DESC_CHARS = 400

// The intro call is a multi-constraint stylistic task, and gemma-4-26b sometimes
// enters an unbounded self-critique loop on it — drafting a usable hook, then
// re-checking it against every rule until the completion budget runs out
// (finish_reason 'length', empty output). Temperature 1.0 flattens the token
// distribution enough that the model reliably samples the "this is done, emit"
// path instead of looping (3/3 vs 2/3 at 0.7 in eval); INTRO_MAX_ATTEMPTS is the
// belt-and-suspenders re-roll for the residual cases. Each re-roll is a fresh
// sample, so a path that looped once almost always converges on the next.
const INTRO_TEMPERATURE = 1.0
const INTRO_MAX_ATTEMPTS = 3

export async function generateContent(feature: string, jobs: Record<string, string>[], featureType: 'job title' | 'agency' | 'trend'): Promise<string> {
  'use step'

  // All three feature types run through the intro writer. Trend has no title
  // template — its `feature` is a 1-2 sentence narrative that we feed as the
  // writer's steering line rather than publishing raw (the raw analyst string
  // came out abstract and place-less: "cross-agency maturation of AI
  // capabilities…" with no sign it was the Singapore public service). The
  // writer re-grounds it in the agencies' missions + the roles' responsibilities.
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

  // All three feature types call the intro writer with enriched substrate — the
  // agencies' own descriptions (their mission anchor; what makes the hook
  // unmistakably Singapore public service) plus a per-role summary of what the
  // work involves — so the hook is grounded in real specifics rather than
  // invented (see RESP_SNIPPET_CHARS / AGENCY_DESC_CHARS). `feature` is the
  // steering line: a short label for agency/job-title, the trend narrative for trend.
  const snippet = (text: string | undefined, max: number) =>
    stripHtml(text).replace(/\s+/g, ' ').trim().slice(0, max)

  // Dedup agency descriptions: a post can pull several roles from the same
  // agency, and repeating its blurb wastes budget and skews the model.
  const agencyDescriptions = new Map<string, string>()
  for (const { row } of ranked) {
    if (agencyDescriptions.has(row.agency)) continue
    const desc = snippet(row.agencyDescription, AGENCY_DESC_CHARS)
    if (desc) agencyDescriptions.set(row.agency, desc)
  }
  const agencyBlock = agencyDescriptions.size === 0
    ? ''
    : `About the hiring agencies (their own descriptions — use these to anchor the work in each agency's mission and who it serves; re-voice, do not quote):\n${
        Array.from(agencyDescriptions.entries())
          .map(([agency, desc]) => `- ${agency}: ${desc}`)
          .join('\n')
      }\n\n`

  const rolesBlock = ranked
    .map(({ row }) => {
      const resp = snippet(row.jobResponsibilities, RESP_SNIPPET_CHARS)
      return resp
        ? `- ${row.jobTitle} — ${row.agency}\n  What the role involves: ${resp}`
        : `- ${row.jobTitle} — ${row.agency}`
    })
    .join('\n')

  const introPrompt = `Feature: ${feature}

${agencyBlock}Roles featured in this post:
${rolesBlock}

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.`

  // Re-roll on empty output: a truncated self-critique loop returns empty text
  // with finish_reason 'length'. A fresh sample almost always converges.
  let introText = ''
  for (let attempt = 1; attempt <= INTRO_MAX_ATTEMPTS; attempt++) {
    const introRes = await generateText({
      model,
      maxOutputTokens: 8192,
      temperature: INTRO_TEMPERATURE,
      system: INTRO_SYSTEM,
      prompt: introPrompt,
    })
    if (introRes.text.trim()) {
      introText = introRes.text.trim()
      break
    }
  }
  // Fallback when every attempt comes back empty: agency/job-title fall back to
  // the title alone (handled in the header below). Trend has no title, so fall
  // back to its raw narrative feature string rather than emit an empty header.
  if (!introText && featureType === 'trend') introText = feature

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

  const header = title
    ? (introText.trim() ? `${title}\n\n${introText.trim()}` : title)
    : introText.trim()
  const assembled = `${header}\n\n${BOILERPLATE_ROLE_INTRO}\n\n${listingsBlock}\n\n${BOILERPLATE_CLOSING}`

  // Escape parens: the post is submitted to a Fillout form that forwards to
  // LinkedIn, which treats unescaped parens as link syntax. Titles like
  // "Government Technology Agency (GovTech)" would otherwise mangle.
  return assembled.replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}
