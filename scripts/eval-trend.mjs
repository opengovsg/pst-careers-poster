// Throwaway eval: would routing the trend narrative through the intro writer
// (instead of publishing it raw) produce grounded, SG-specific copy?
// Reconstructs an AI-themed cross-agency substrate from live listings (approx —
// not the exact ids the Wednesday trend picked) and feeds it + the trend
// narrative as the `Feature:` line through the shipped INTRO_SYSTEM at temp 1.0.
// Run: node --env-file=.env.local scripts/eval-trend.mjs
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
const AI = /\b(A\.?I\.?|artificial intelligence|machine learning|\bML\b|ML ?ops|MLOps|LLM|generative|data scien|computer vision|deep learning)\b/i
const isAI = (j) => AI.test(`${j.jobTitle} ${j.functionalArea} ${j.field} ${strip(j.jobResponsibilities)}`)

const jobs = await (await fetch(process.env.JOB_LISTINGS_JSON_URL)).json()

// AI-themed roles, deduped by agency+title, round-robin across agencies, take 8.
const seen = new Set()
const cands = jobs.filter(isAI).filter(j => {
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
while (picked.length < 8 && queues.some(q => q.length)) {
  for (const q of queues) { if (picked.length < 8 && q.length) picked.push(q.shift()) }
}

const agencyDescriptions = new Map()
for (const row of picked) {
  if (agencyDescriptions.has(row.agency)) continue
  const d = snippet(row.agencyDescription, 400)
  if (d) agencyDescriptions.set(row.agency, d)
}
const agencyBlock = agencyDescriptions.size === 0 ? '' :
  `About the hiring agencies (their own descriptions — context only, do not quote):\n${
    [...agencyDescriptions].map(([a, d]) => `- ${a}: ${d}`).join('\n')}\n\n`
const rolesBlock = picked.map(row => {
  const r = snippet(row.jobResponsibilities, 500)
  return r ? `- ${row.jobTitle} — ${row.agency}\n  What the role involves: ${r}` : `- ${row.jobTitle} — ${row.agency}`
}).join('\n')

const userPrompt = `Feature: ${TREND}

${agencyBlock}Roles featured in this post:
${rolesBlock}

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.`

// Shipped INTRO_SYSTEM (matches generate-content.ts).
const INTRO_SYSTEM = `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Voice: write like a curious engineer telling a peer about something genuinely interesting they just ran into. A little warmth and energy is good and wanted — it should sound like a person who finds this work cool, not a press release. The warmth comes from the substance being genuinely interesting, never from adjectives. What is banned is sales talk: hype words (exciting, cutting-edge, world-class, dynamic, passionate, transformative), "join us", "make an impact", and anything that reads like a job ad. No markdown, no asterisks, no bullet points. Vary sentence length for rhythm.

Grounding: you are given each agency's own description and a summary of what each role involves, written in dull, bureaucratic language. Find the real substance buried in them — the systems, tools, domains, and who the work serves. Keep precise technical terms exactly as written (named systems, tools, methods, and domains — e.g. "MLOps", "computer vision", "RAG"); those ARE the substance and must survive into your hook. What you must not reuse is the dull sentence structure and bureaucratic framing — supply your own. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Focus: a headline stating the breadth of roles is added separately, so do not try to summarise or survey everything the roles do — a list of everything reads as flat. Pick the one or two most concrete and vivid threads and lead with them. One sharp, real detail beats a complete catalogue.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Your first sentence must state the problem, the tension, or what is at stake as a complete thought — and it must not name any tool, system, or technical term. Save every specific (named systems, tools, methods, domains) for the second sentence onward. This forces a real hook instead of a documentation-style "we build X" opening. Do not open with "I", and do not open with a compliment or affirmation.

Second paragraph: go deeper on that same thread — what makes the problem hard, or what the work touches and who it serves. Stay concrete and specific. No call-to-action, no role listing — those are added separately.`

console.log('================ SUBSTRATE (Feature = trend narrative) ================\n')
console.log(userPrompt)
console.log(`\n(reconstructed ${picked.length} AI roles across ${new Set(picked.map(p => p.agency)).size} agencies — approximate, not the exact Wednesday ids)\n`)

for (let i = 1; i <= 3; i++) {
  const res = await generateText({ model, system: INTRO_SYSTEM, prompt: userPrompt, maxOutputTokens: 8192, temperature: 1.0 })
  writeFileSync(`/tmp/eval-reasoning-TREND-${i}.json`, JSON.stringify({ sample: i, finishReason: res.finishReason, usage: res.usage, reasoningText: res.reasoningText ?? null, text: res.text }, null, 2))
  console.log(`\n================ TREND→WRITER — sample ${i} (finish: ${res.finishReason}, out: ${res.usage?.outputTokens ?? '?'}) ================\n`)
  console.log(res.text.trim() || '(EMPTY — truncated)')
}
