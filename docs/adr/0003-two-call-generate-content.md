# ADR 0003: Two-call architecture with row-ID frame in `generateContent`

## Status

Accepted.

## Context

`generateContent` writes the LinkedIn post. The original implementation made a single LLM call with a long prompt that asked the model to simultaneously:

- Curate 6-10 roles from a CSV of all featured listings
- Reproduce each role's URL verbatim, including a UUID and UTM parameters (~80 characters each)
- Write a creative hook paragraph
- Stay under LinkedIn's effective 2,400-character cap
- Group listings by agency, with an introductory sentence per agency block
- Avoid Markdown (LinkedIn doesn't render it)
- Use passive voice and British English

This combination worked on Claude Sonnet 4.5 but was brittle on smaller models. An eval across multiple free-tier candidates — GLM-4.5 Air, GLM 4.7 Flash, Llama 4 Scout, Nemotron 120B, Gemma 4 26B, Sea-Lion 27B, Mistral 24B, and others — found that every model failed at least one of the following in ways the prompt could not fix:

- **URL hallucination.** Models invented UUIDs that looked plausible but pointed at wrong listings. Llama 4 Scout duplicated listings under different agency headers.
- **Length blowouts.** Output character counts varied from 1,629 to 16,739 across models on identical input.
- **Markdown contamination.** Reasoning-class models would explicitly read the "no Markdown" rule, draft with `**bold**` anyway, and tick "No \*\*" on their own self-check.
- **Reasoning-budget exhaustion.** Chain-of-thought consumed the completion-token budget before the model emitted any user-facing token, returning empty content with `finish_reason: length`.

The only viable single-call model was Sonnet. This was acceptable when running on shared infrastructure, but conflicts with a goal of running the workflow on segregated credentials without paid third-party API dependencies.

## Decision

Replace the single LLM call with two narrow calls plus deterministic assembly.

### (1) Listings call

Build a slim CSV with a leading integer `id` column (`1..N`) and feature columns: `jobTitle`, `agency`, `remainingDays`, `experienceYearsMin`, `experienceYearsMax`. The model is asked to output 6-10 integer ids, one per line — nothing else. The runner validates each emitted id against an `idToRow` map, dedups, and joins back to canonical `{jobTitle, agency, url}` from the source data. URLs are never reproduced by the model.

### (2) Intro call

Feed the model the chosen `Title — Agency` pairs (no URLs, no CSV) and ask for a 1-2 sentence hook. The output surface is small enough that format compliance becomes near-automatic.

### (3) Deterministic assembly

Intro + blank line + listings grouped by agency (agency as section header, `- Title - URL` lines underneath, sections ordered by count descending with ties broken by the model's first-pick order; single-agency runs collapse to a flat bullet list) + blank line + boilerplate closing.

The LLM's only remaining responsibilities are ranking row ids and writing a short hook. Both are well within the capabilities of small free-tier models. The architecture was validated against `workers-ai/@cf/zai-org/glm-4.7-flash`, `workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct`, `workers-ai/@cf/nvidia/nemotron-3-120b-a12b`, and `workers-ai/@cf/google/gemma-4-26b-a4b-it`. All four pass.

### Why integer ids and not URLs

URLs are ~80-character opaque strings (`hrp/<jobId>/<UUID>?utm_...`). Verbatim reproduction is hard for small models even with copy-friendly prompting. Integers in `1..N` collapse the validation surface from "exact-match a long URL string" to "is this integer in range?" Three layered backstops in the runner:

1. **Range validation** — drop any integer outside `1..jobs.length`.
2. **Dedup** — if the model emits the same integer twice, count it once.
3. **Floor check + retry** — if fewer than `RANKING_FLOOR` valid ids parse, retry once. Best-of-N across attempts; throw only if every attempt yields zero.

### Why grouping is runner-side, not LLM-side

In the single-call eval, models that tried to group listings frequently hallucinated agency labels (placing a CSIT role under a "Government Technology Agency" header, etc.). The agency is a column in the source data; the runner already has it via the id lookup; the LLM never needs to emit it. Removing the temptation removes the failure mode.

### `maxOutputTokens` calibration

The listings call uses `maxOutputTokens: 8192` and the intro call uses `4096`. Lower values silently truncate reasoning-class models — visible chain-of-thought consumes the completion budget before any user-facing token is emitted, returning empty content with `finish_reason: length`. Non-reasoning models (Llama-class) are unaffected by the larger limits.

## Consequences

- Free-tier models become viable for the writer step. Choice between Cloudflare AI Gateway candidates (Llama 4 Scout for speed, Gemma 4 26B for voice quality, Nemotron 120B for distinctiveness, GLM 4.7 Flash for cost) is now a tuning concern, not a quality blocker.
- Two LLM round-trips per post instead of one. Total latency is roughly 2-4× the original, depending on the model.
- The writer's prompts no longer need URL-preservation rules, length caps, agency-grouping instructions, or Markdown bans. Those are deterministic concerns now, and the prompts shrink accordingly.
- Title and agency strings always come from source data; the writer cannot drift from the input even if it tries.
- A missing entry in `ROLE_TAGS` (ADR-0001, ADR-0002) does not affect the writer — only feature selection and tech-role visibility upstream.
- Operational surface in the runner grows: id validation, dedup, retry, lookup join, grouping. None of these require LLM calls.
