# Free-tier model evaluation (LinkedIn-post generation)

- **Theme:** LLM evaluation / model selection
- **Captured:** 2026-05-19 (point-in-time; verify against current code)
- **Status:** Breakthrough 2026-05-18 — the two-call + row-id architecture made all four previously-failing CF AI Gateway models viable. Production migration was pending after the 2026-05-19 cron run. Historical single-call findings kept as context.

## 2026-05-18 breakthrough: two-call + row-id architecture

The single-call eval failure modes (URL hallucination, length blowout, markdown contamination, chain-of-thought eating token budget) all turned out to be artefacts of asking one model to simultaneously curate, reproduce N long URLs verbatim, write creative prose, and stay under 2,400 chars. Splitting into two narrower calls + offloading URL/title/agency reproduction to deterministic lookups cleared the gate for every CF AI Gateway model previously written off as "not viable".

Architecture details (and *why*): see [two-call-architecture](two-call-architecture.md). Runner: `/tmp/linkedin-eval/run-two-call-eval.mjs`.

**All four CF AI Gateway models viable after the rework** (sample run, feature = "Cybersecurity Specialist", 86 candidate listings):

| Model | Listings latency | Intro latency | Assembled chars | Notes |
|---|---|---|---|---|
| `@cf/zai-org/glm-4.7-flash` | 88s | 24s | 2,435 | Slowest by far (~112s combined). Operational risk for cron + retries. |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 1.1s | 2.5s | 2,554 | Fastest by 20×. Voice is generic ("vibrant cybersecurity community"). No reasoning channel. |
| `@cf/nvidia/nemotron-3-120b-a12b` | 30s | — | 2,070 | Most distinctive voice ("break into systems to strengthen them"). Uses non-ASCII em-dash + non-breaking hyphen (`‑`). Worth a normalisation pass if chosen. |
| `@cf/google/gemma-4-26b-a4b-it` | 50s | — | 2,212 | Best specificity-to-length ratio; intro names domains that actually map to listings ("rail networks", "red teaming"). |

User had not chosen a production model yet. The Sea-Lion candidate was dropped from this round per user direction ("not convinced there is much value over llama"). Operational tradeoff if forced to pick: Llama (fast, generic) vs Gemma (slow, strongest voice).

**2026-05-19 update: production runs `z-ai/glm-4.5-air:free` via OpenRouter.** Production model is OpenRouter-routed GLM-4.5 Air, not a CF AI Gateway candidate. Reasoning-class — the `maxOutputTokens: 8192` bump on the intro call (commit 3ceacd9) applies to live cron output, not just future migrations.

**Configuration that unlocked the reasoning models** — when reasoning models hit `finish_reason: length` with empty `content`, the cause is the chain-of-thought consuming the completion budget before the model writes any user-facing tokens. Two settings together fixed this in the runner:
- Listings call `max_tokens`: 8192 (was 2048)
- Intro call `max_tokens`: 8192 (was 512; was 4096 with the single-sentence intro prompt — see below)

Anything lower will silently truncate GLM 4.7 Flash, Nemotron 120B, and Gemma-4 26B. Llama-4 Scout is unaffected because it doesn't expose a reasoning channel.

**2026-05-19 follow-up: intro prompt expansion forced an 8192 bump.** The original 4096 cap on the intro call was empirically sufficient for the "1-2 sentences, 200-300 chars" prompt. After expanding to "two paragraphs, 1-3 sentences each, vary length for rhythm" (commit 8a0503f), Gemma's reasoning channel went into a draft→critique→redraft loop on the richer structural requirements — 1 in 3 samples hit `finish_reason: length` with 18K reasoning chars and zero user-facing content. Bumping to 8192 cleared it (5/5 samples adherent, latency 40-60s). Production updated; AGENTS.md updated. Eval artefacts: `/tmp/linkedin-eval/intro-prompt-8k/`.

**Prompt contradictions are load-bearing for reasoning models.** A subtle bug — system message said "1-2 sentences" while user message said "2-3 sentences" — caused both Gemma's and Nemotron's visible reasoning to spin on the conflict and burn the budget. Fix: align both messages, or push all length constraints into a single message. Llama silently chose the user-message instruction without flagging the contradiction.

## Pending: production migration

Code in `workflows/generate-post/steps/generate-content.ts` was unchanged at capture time. After the 2026-05-19 production run (Tuesday agency cron), port the two-call architecture into the workflow:
1. Add a `rank-listings` step that builds the row-id CSV and calls the LLM for integer IDs.
2. Modify `generate-content.ts` to accept the ranked IDs, call the LLM only for the intro hook, and assemble the final post deterministically (group by agency, sort sections by count desc with insertion-order ties).
3. Decide whether the LLM provider is OpenRouter (`z-ai/glm-4.5-air:free`) or CF AI Gateway (`workers-ai/@cf/<picked-model>`). The CF route has the operational simplification of already-segregated credentials; the OpenRouter route needs new credential segregation work.
4. Drop the URL-strengthening and length-cap prompt content from `generate-content.ts` — those constraints are no longer the LLM's responsibility.

User explicit: "we'll work through the vercel workflow code changes after tomorrow's production run."

## Historical context — pre-breakthrough single-call findings

The section below documents single-call eval state from 2026-05-15 → 2026-05-17. Kept for context on what *each model's actual ceiling looks like in single-call mode*. None of these verdicts apply under the new architecture; refer to the table above instead.

### Verdict (single-call, 2026-05-17)

After full CF AI Gateway shopping trip (2026-05-17, five `@cf/*` candidates), the picture had not improved on the OpenRouter findings. Two viable free-tier candidates with different tradeoffs:

1. **`z-ai/glm-4.5-air:free` via OpenRouter** — still the most reliable. 0% bold-leak across two completed samples, slower (78–236s), uses OpenRouter free tier. Requires the strengthened URL rule already merged to production prompt.
2. **`workers-ai/@cf/zai-org/glm-4.7-flash` via Cloudflare AI Gateway** — faster (48–118s), uses already-have CF credentials with `default` gateway, but **only viable with two guardrails**: (a) a post-processing markdown strip in workflow code per [markdown-contamination](markdown-contamination.md), and (b) a length-check + retry on overflow (three samples all over the 2,400 cap by 5-33%; URL duplication appeared on the third sample against well-formed CSV input). User had chosen not to add either guardrail yet (2026-05-17).

The other CF AI Gateway candidates — Sea-Lion 27B, Llama-4 Scout, Nemotron 120B, Gemma-4 26B — were all not viable in single-call mode: see model table below. The user's read on Nemotron specifically: "Nemotron's copy is quite lacking, esp compared to GLM Air on OpenRouter" — press-release prose, hallucinated curation diversity (intro names two agencies, listings cover one), and >120s wall-clock latency makes it a deployment risk for a Vercel cron handler.

Length variance affected both viable candidates: 2,125–2,830 chars (GLM-4.5 Air) and 2,533–3,186 chars (GLM 4.7 Flash). The new 2,400-cap + 2,200-target prompt rule tightened this but didn't solve it. A length-check + retry guardrail in workflow code remained the missing piece.

### Models tested and outcomes (2026-05-15)

| Model | Provider route | Outcome |
|---|---|---|
| `z-ai/glm-4.5-air:free` | OpenRouter direct | **Viable, reliable.** Original prompt: 1,838 chars, no URLs. Tougher URL prompt: URLs returned, lengths 2,125 / 2,830 across two samples, zero bold leaks. Latency 78–236s. |
| `workers-ai/@cf/zai-org/glm-4.7-flash` | Cloudflare AI Gateway (`default`) | **Borderline; needs post-proc strip + length retry.** Three samples: 2,533 (clean, 1 agency misattribution), 2,918 (`**bold**` headers + 22% over cap), 3,186 (URL duplication via fake "agency header" rows + 33% over cap, against well-formed CSV input). Latency 48-118s. Each sample fails a different rule; length variance monotonically worsened across three samples. |
| `workers-ai/@cf/aisingapore/gemma-sea-lion-v4-27b-it` | Cloudflare AI Gateway | **Not viable.** 3,357 chars (40% over cap). Listings glued into single comma-separated prose paragraphs per agency block instead of one per line. Output ends with literal text `Character count: 2339` — model emits its own self-check artefact into the user-facing output, off by ~30% from reality. Singapore-trained angle didn't help. |
| `workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct` | Cloudflare AI Gateway | **Not viable.** Round 2: 2,751 chars (351 over cap), drops `#hiring`, hallucinates agency grouping (CSIT roles under GovTech block, MDDI's SNDG role under CSA block), and lists jobId 17525435 twice in the same post. Structural confusion deeper than the max_tokens issue. |
| `workers-ai/@cf/nvidia/nemotron-3-120b-a12b` | Cloudflare AI Gateway | **Rule-compliant but deployment-blocked by latency.** Sample 1: 1,629 chars, 8/10 rubric clean, 5,484 reasoning tokens, 72s latency. Sample 2: **timed out at 120s.** Both samples: intro names CSA + GovTech but listings are 4×/5× CSA-heavy — curation skew not a one-off. Prose reads press-release-formal rather than recruitment-warm. |
| `workers-ai/@cf/google/gemma-4-26b-a4b-it` | Cloudflare AI Gateway | **Not viable — DNF (single-call).** Timed out at 120s, no output returned. (Became the leading candidate post-rework — see table at top.) |
| `nvidia/nemotron-3-super-120b-a12b:free` | OpenRouter direct | 550 chars, featured exactly 1 role. Token accounting suggests hidden reasoning content not extracted by our parser. |
| `arcee-ai/trinity-large-thinking:free` | OpenRouter direct | 16,739 chars (6.7× cap), agency misattribution, `#hiring` repeated per agency. Length-discipline failure. |
| `baidu/cobuddy:free` | OpenRouter direct | Three samples: 2,852 / 6,355 / 14,579 chars — wild variance. Shortest sample also broke `<title> - <url>` pairing and stripped UTM params. |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | Cloudflare Workers AI direct | 5,386 chars, truncated mid-listing at max_tokens=2048. Can't curate down. |
| `deepseek/deepseek-v4-flash:free` | OpenRouter direct | **Broken endpoint.** Returns gibberish even on trivial prompts; content null, reasoning field is multilingual garbage. Skip. |
| `openrouter/free` (alias) | OpenRouter | One attempt returned 4,344 chars with **hallucinated URL UUIDs** that look real but point at wrong pages, plus emoji + curly quotes; the other connection-dropped at 240s. Do not use where URLs matter. |
| `nousresearch/hermes-3-llama-3.1-405b:free` | OpenRouter → **Venice** | Unreachable on shared free tier. 4 attempts honoring `Retry-After` all 429ed. |
| `qwen/qwen3-next-80b-a3b-instruct:free` | OpenRouter → **Venice** | Same as Hermes — Venice rate-limited the free tier into unusability. |
| `google/gemma-4-31b-it:free` | OpenRouter → Google AI Studio | Rate-limited; no `Retry-After`, single retry failed. Too flaky to pursue. |

### What unlocked GLM-4.5 Air (single-call)

The production prompt says "ALWAYS INCLUDE THE URL, IT IS IMPORTANT" — Sonnet obeys, GLM-4.5 Air did not. The fix that worked in the eval runner added three reinforcements:
1. A top-of-list CRITICAL RULE framing URL omission as a hard failure mode.
2. An explicit positive example showing a correctly formatted title + URL line with full UUID + UTM params.
3. A self-verification step at the end.

These were additive and didn't change Sonnet's output — safe to merge if switching providers. (Mostly moot under the two-call architecture, where URLs are runner-side.)

### GLM 4.7 Flash deep dive (2026-05-17)

Recovered the full reasoning trace from a sample-2 raw response. 45,085 chars of reasoning for a 2,918-char post. Two distinct failure modes:

**Length-panic loop (prompt-tunable).** Model estimated section sizes three times — 3,300 → 5,600 → 7,487 chars — getting *worse* each iteration before "Extreme Trimming". Each "trim" was a near-complete rewrite, because the prompt treats length as a *constraint to check at the end* rather than a *budget to plan around upfront*. Proposed nudges (untested): lead with budget arithmetic; forbid the draft-then-trim loop directly; hard per-agency-description cap.

**Markdown contamination (not prompt-tunable).** Model read the no-bold rule, reminded itself of it before drafting, used bold in every draft anyway, and ticked "No \*\*" on its final formatting check while three bold headers sat in its output. See [markdown-contamination](markdown-contamination.md) for the full diagnostic and why a post-processing strip is the robust fix.

### Provider observations

- **Cloudflare AI Gateway via `default`** works with just `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` — no pre-created gateway, no separate AI Gateway token. URL: `https://gateway.ai.cloudflare.com/v1/<account>/default/compat/chat/completions`. Model name in body as `workers-ai/@cf/<provider>/<model>`. Auth via `Authorization: Bearer <CF_API_TOKEN>`. Real operational simplification vs OpenRouter — the Cloudflare account is already segregated from OGP/PAIR.
- **Cloudflare Workers AI defaults `max_tokens` to 256 for some models** — Llama-4 Scout silently truncated mid-URL. Always set `max_tokens` explicitly; 8192 is a safe value.
- **CF Workers AI catalogue is paid per-token** (no `:free`), but the 10K-neuron/day free quota covers weekly cron usage empirically. Eval-style burst calls do hit the wall.
- **Venice** is the bottleneck for several flagship-looking OpenRouter free models (Hermes 405B, Qwen 3 Next 80B) — shared free-tier rate-limit pool is saturated.

### Runner script

Lived at `/tmp/linkedin-eval/run-eval.mjs` (and `run-two-call-eval.mjs` for the rework). Key features: real fetch cancellation via `AbortController`; per-candidate live logging; up to 4 attempts on 429 honoring `Retry-After`; content extraction falls back `content` → `reasoning_content` → `reasoning`; raw response persisted as `<model>.raw.json`; `OR_KEY = process.env.OPENAI_API_KEY` (OpenRouter creds stored under `OPENAI_*` names). Sample feature input at `data/sample-feature-role.json`.

## Related

- [two-call-architecture](two-call-architecture.md) — the pattern that unlocked all four models
- [markdown-contamination](markdown-contamination.md) — the regex-strip fix
