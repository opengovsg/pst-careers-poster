// Eval harness: compare two INTRO_SYSTEM variants on a fixed intro input prompt
// (the "Roles featured in this post …" user message captured from a real run).
// Usage: node --env-file=.env.local scripts/eval-intro.mjs [input-prompt.txt]
//   defaults to /tmp/content-input-prompt.txt
import { readFileSync, writeFileSync } from 'node:fs'
import { generateText } from 'ai'
import { createAiGateway } from 'ai-gateway-provider'
import { createUnified } from 'ai-gateway-provider/providers/unified'

const provider = createAiGateway({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  gateway: 'default',
  apiKey: process.env.CLOUDFLARE_API_TOKEN,
})
const model = provider(createUnified()(process.env.CF_AI_MODEL_NAME))

const userPrompt = readFileSync(process.argv[2] ?? '/tmp/content-input-prompt.txt', 'utf8').trim()

// A — previous baseline (focus + term-preservation, but flat documentation voice).
const A_SHIPPED = `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Style: direct and grounded. Vary sentence length for rhythm. No buzzwords, no markdown, no asterisks, no bullet points. Sound engaged and genuinely interested in the work, not detached — but never like a recruiter.

Grounding: you are given each agency's own description and a summary of what each role involves, written in dull, bureaucratic language. Find the real substance buried in them — the systems, tools, domains, and who the work serves. Keep precise technical terms exactly as written (named systems, tools, methods, and domains — e.g. "MLOps", "computer vision", "RAG"); those ARE the substance and must survive into your hook. What you must not reuse is the dull sentence structure and bureaucratic framing — supply your own. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Focus: a headline stating the breadth of roles is added separately, so do not try to summarise or survey everything the roles do — a list of everything reads as flat. Pick the one or two most concrete and vivid threads and lead with them. One sharp, real detail beats a complete catalogue.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Open on one specific, concrete thing from the descriptions — a system, a problem, or something being built. Do not open with "I", do not open with a compliment or affirmation.

Second paragraph: go deeper on that same thread — what makes the problem hard, or what the work touches. Stay concrete and specific. No call-to-action, no role listing — those are added separately.`

// B — shipped: decouple warmth from sales, force a tension/stakes-first open via
// the crisp "no tool names in sentence 1" rule. Matches INTRO_SYSTEM in
// generate-content.ts.
const B_WARMTH = `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Voice: write like a curious engineer telling a peer about something genuinely interesting they just ran into. A little warmth and energy is good and wanted — it should sound like a person who finds this work cool, not a press release. The warmth comes from the substance being genuinely interesting, never from adjectives. What is banned is sales talk: hype words (exciting, cutting-edge, world-class, dynamic, passionate, transformative), "join us", "make an impact", and anything that reads like a job ad. No markdown, no asterisks, no bullet points. Vary sentence length for rhythm.

Grounding: you are given each agency's own description and a summary of what each role involves, written in dull, bureaucratic language. Find the real substance buried in them — the systems, tools, domains, and who the work serves. Keep precise technical terms exactly as written (named systems, tools, methods, and domains — e.g. "MLOps", "computer vision", "RAG"); those ARE the substance and must survive into your hook. What you must not reuse is the dull sentence structure and bureaucratic framing — supply your own. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Focus: a headline stating the breadth of roles is added separately, so do not try to summarise or survey everything the roles do — a list of everything reads as flat. Pick the one or two most concrete and vivid threads and lead with them. One sharp, real detail beats a complete catalogue.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Your first sentence must state the problem, the tension, or what is at stake as a complete thought — and it must not name any tool, system, or technical term. Save every specific (named systems, tools, methods, domains) for the second sentence onward. This forces a real hook instead of a documentation-style "we build X" opening. Do not open with "I", and do not open with a compliment or affirmation.

Second paragraph: go deeper on that same thread — what makes the problem hard, or what the work touches and who it serves. Stay concrete and specific. No call-to-action, no role listing — those are added separately.`

const SAMPLES = 3
const TEMP = Number(process.env.EVAL_TEMP ?? 1.0) // shipped intro temperature

const run = async (label, system) => {
  for (let i = 1; i <= SAMPLES; i++) {
    const res = await generateText({ model, system, prompt: userPrompt, maxOutputTokens: 8192, temperature: TEMP })
    const dumpPath = `/tmp/eval-reasoning-${label}-${i}.json`
    writeFileSync(dumpPath, JSON.stringify({
      label, sample: i,
      finishReason: res.finishReason,
      usage: res.usage,
      reasoningText: res.reasoningText ?? null,
      reasoning: res.reasoning ?? null,
      providerMetadata: res.providerMetadata ?? null,
      text: res.text,
    }, null, 2))
    console.log(`\n================ ${label} — sample ${i} (temp: ${TEMP}, finish: ${res.finishReason}, out tokens: ${res.usage?.outputTokens ?? '?'}) — trace: ${dumpPath} ================\n`)
    console.log(res.text.trim() || '(EMPTY — truncated)')
  }
}

// A is well understood (flat documentation voice); re-run B only to save neurons.
await run('B_WARMTH', B_WARMTH)
