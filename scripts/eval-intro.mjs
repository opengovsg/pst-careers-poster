// Eval harness: compare two INTRO_SYSTEM variants on a fixed intro input prompt
// (the "Roles featured in this post …" user message captured from a real run).
// Usage: node --env-file=.env.local scripts/eval-intro.mjs [input-prompt.txt]
//   defaults to /tmp/content-input-prompt.txt
import { readFileSync } from 'node:fs'
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

const OLD = `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Style: direct and grounded. Vary sentence length for rhythm. No buzzwords, no markdown, no asterisks, no bullet points. Sound engaged and genuinely interested in the work, not detached — but never like a recruiter.

Grounding: you are given each agency's own description and a summary of what each role involves. These are written in dull, bureaucratic language. Your job is to find the real substance buried in them — the systems, tools, domains, and who the work serves — and give it energy in your own words. Never reuse the source phrasing or copy its phrases. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Name something specific and concrete about this work, drawn from the descriptions. Do not open with "I", do not open with a compliment or affirmation.

Second paragraph: expand on what kind of work this actually is, or who would thrive here. Be concrete. No call-to-action, no role listing — those are added separately.`

const NEW = `You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Style: direct and grounded. Vary sentence length for rhythm. No buzzwords, no markdown, no asterisks, no bullet points. Sound engaged and genuinely interested in the work, not detached — but never like a recruiter.

Grounding: you are given each agency's own description and a summary of what each role involves, written in dull, bureaucratic language. Find the real substance buried in them — the systems, tools, domains, and who the work serves. Keep precise technical terms exactly as written (named systems, tools, methods, and domains — e.g. "MLOps", "computer vision", "RAG"); those ARE the substance and must survive into your hook. What you must not reuse is the dull sentence structure and bureaucratic framing — supply your own. Never invent systems, metrics, or claims that are not in the text; if a role's description is vague, keep the hook plain rather than embellishing.

Focus: a headline stating the breadth of roles is added separately, so do not try to summarise or survey everything the roles do — a list of everything reads as flat. Pick the one or two most concrete and vivid threads and lead with them. One sharp, real detail beats a complete catalogue.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Open on one specific, concrete thing from the descriptions — a system, a problem, or something being built. Do not open with "I", do not open with a compliment or affirmation.

Second paragraph: go deeper on that same thread — what makes the problem hard, or what the work touches. Stay concrete and specific. No call-to-action, no role listing — those are added separately.`

const SAMPLES = 2

const run = async (label, system) => {
  for (let i = 1; i <= SAMPLES; i++) {
    const res = await generateText({ model, system, prompt: userPrompt, maxOutputTokens: 8192, temperature: 0.7 })
    console.log(`\n================ ${label} — sample ${i} (out tokens: ${res.usage?.outputTokens ?? '?'}) ================\n`)
    console.log(res.text.trim())
  }
}

await run('OLD PROMPT', OLD)
await run('NEW PROMPT', NEW)
