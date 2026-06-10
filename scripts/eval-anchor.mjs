// Throwaway eval: variant C (agency-mission anchor + opening-variety nudge).
// Tests two scenarios — the AI trend substrate and a normal Data Science
// feature — to see if the hook becomes (a) unmistakably Singapore-public-service
// and (b) less reliant on the "X easy / Y hard" contrast opener. Reconstructs
// substrate from live listings (approximate). temp 1.0, 3 samples each.
// Run: node --env-file=.env.local scripts/eval-anchor.mjs
import { writeFileSync } from 'node:fs'
import { generateText } from 'ai'
import { createAiGateway } from 'ai-gateway-provider'
import { createUnified } from 'ai-gateway-provider/providers/unified'

const provider = createAiGateway({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  gateway: 'default',
  apiKey: process.env.CLOUDFLARE_API_TOKEN,
})
const model = provider(createUnified()(process.env.CF_AI_MODEL_NAME))

const TREND = 'Cross-agency maturation of AI capabilities, moving from basic data science toward a specialized stack including MLOps infrastructure, AI-specific security, and AI product management.'

const strip = (s) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
const snippet = (t, max) => strip(t).replace(/\s+/g, ' ').trim().slice(0, max)

const jobs = await (await fetch(process.env.JOB_LISTINGS_JSON_URL)).json()

const buildSubstrate = (matchFn, n = 8) => {
  const seen = new Set()
  const cands = jobs.filter(matchFn).filter(j => {
    const k = `${j.agency}::${j.jobTitle}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
  const byAgency = new Map()
  for (const j of cands) {
    if (!byAgency.has(j.agency)) byAgency.set(j.agency, [])
    byAgency.get(j.agency).push(j)
  }
  const queues = [...byAgency.values()]
  const picked = []
  while (picked.length < n && queues.some(q => q.length)) {
    for (const q of queues) { if (picked.length < n && q.length) picked.push(q.shift()) }
  }
  const descs = new Map()
  for (const row of picked) {
    if (descs.has(row.agency)) continue
    const d = snippet(row.agencyDescription, 400)
    if (d) descs.set(row.agency, d)
  }
  const agencyBlock = descs.size === 0 ? '' :
    `About the hiring agencies (their own descriptions — use these to anchor the work in each agency's mission and who it serves; re-voice, do not quote):\n${
      [...descs].map(([a, d]) => `- ${a}: ${d}`).join('\n')}\n\n`
  const rolesBlock = picked.map(row => {
    const r = snippet(row.jobResponsibilities, 500)
    return r ? `- ${row.jobTitle} — ${row.agency}\n  What the role involves: ${r}` : `- ${row.jobTitle} — ${row.agency}`
  }).join('\n')
  return { picked, agencyBlock, rolesBlock }
}

const AI = /\b(A\.?I\.?|artificial intelligence|machine learning|ML ?ops|MLOps|\bLLM\b|generative|computer vision|deep learning)\b/i
const isAI = (j) => AI.test(`${j.jobTitle} ${strip(j.jobResponsibilities)}`)
const isDS = (j) => /\bdata scien|data analyst/i.test(j.jobTitle ?? '')

// Variant C — agency-mission anchor + opening-variety nudge.
const INTRO_SYSTEM = `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Voice: write like a curious engineer telling a peer about something genuinely interesting they just ran into. A little warmth and energy is good and wanted — it should sound like a person who finds this work cool, not a press release. The warmth comes from the substance being genuinely interesting, never from adjectives. What is banned is sales talk: hype words (exciting, cutting-edge, world-class, dynamic, passionate, transformative), "join us", "make an impact", and anything that reads like a job ad. No markdown, no asterisks, no bullet points. Vary sentence length for rhythm.

Grounding: you are given each agency's own description and a summary of what each role involves, written in dull, bureaucratic language. Find the real substance buried in them — the systems, tools, domains, and who the work serves. Keep precise technical terms exactly as written (named systems, tools, methods, and domains — e.g. "MLOps", "computer vision", "RAG"); those ARE the substance and must survive into your hook. What you must not reuse is the dull sentence structure and bureaucratic framing — supply your own. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Anchor: this is the Singapore public service, and the hook must make that unmistakable. Each agency's own description tells you its public mission and who it exists to serve — drawn only from the descriptions you are given, make clear what public purpose this work is for. Ground the stakes in that mission, re-voiced in your own words and never quoted; never invent a public purpose the descriptions do not state. For a single agency that is its mission; across several it is the public outcomes they share.

Focus: a headline stating the breadth of roles is added separately, so do not try to summarise or survey everything the roles do — a list of everything reads as flat. Pick the one or two most concrete and vivid threads and lead with them. One sharp, real detail beats a complete catalogue.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Your first sentence must set up the hook as a complete thought — the stakes, who the work is for, the situation, or the problem — and it must not name any tool, system, or technical term. Vary how you open: do not reflexively reach for an "X is easy but Y is hard" or "X is one thing, Y is another" contrast; that framing is becoming a tic. Save every specific for the second sentence onward. Do not open with "I", and do not open with a compliment or affirmation.

Second paragraph: go deeper on that same thread — what makes the problem hard, or what the work touches and who it serves. Stay concrete and specific. No call-to-action, no role listing — those are added separately.`

const run = async (label, feature, sub) => {
  const userPrompt = `Feature: ${feature}

${sub.agencyBlock}Roles featured in this post:
${sub.rolesBlock}

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.`
  console.log(`\n\n############### ${label} — ${sub.picked.length} roles / ${new Set(sub.picked.map(p => p.agency)).size} agencies (approx reconstruction) ###############`)
  for (let i = 1; i <= 3; i++) {
    const res = await generateText({ model, system: INTRO_SYSTEM, prompt: userPrompt, maxOutputTokens: 8192, temperature: 1.0 })
    writeFileSync(`/tmp/eval-reasoning-ANCHOR-${label}-${i}.json`, JSON.stringify({ label, sample: i, finishReason: res.finishReason, usage: res.usage, reasoningText: res.reasoningText ?? null, text: res.text }, null, 2))
    console.log(`\n==== ${label} sample ${i} (finish: ${res.finishReason}, out: ${res.usage?.outputTokens ?? '?'}) ====\n`)
    console.log(res.text.trim() || '(EMPTY — truncated)')
  }
}

await run('TREND', TREND, buildSubstrate(isAI))
await run('DATASCI', 'Data Science', buildSubstrate(isDS))
