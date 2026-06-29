# Two-call + row-id architecture

- **Theme:** LLM evaluation / architecture
- **Captured:** 2026-05-18 (point-in-time; verify against current code)
- **Status:** Pattern that unlocked all four CF AI Gateway models that previously failed. Production migration deferred until after the 2026-05-19 cron run; since landed in `generate-post/`.

## The pattern

Replace a single "write the whole LinkedIn post" LLM call with two narrower calls plus deterministic assembly:

**Call 1 — Listings (rank rows by integer ID).** Build a CSV of candidate listings with a leading `id` column (`1..N`) and slim feature columns (jobTitle, agency, remainingDays, experienceYearsMin/Max). The model outputs 6-10 integer IDs, one per line — no titles, no URLs, no prose. Runner validates each ID is in range, dedups, and joins back to canonical `{jobTitle, agency, url}` from the source dataset.

**Call 2 — Intro hook (prose only).** Feed the model the chosen listings as enriched substrate (no URLs, no CSV). Ask for a short hook. Output is plain prose; the model never has to reproduce URLs or maintain format compliance across long structured output.

**Deterministic assembly.** Runner concatenates: `<intro>` + blank line + listings grouped by agency (agency as section header, `- Title - URL` under each), sections ordered by listing count desc with insertion-order ties + blank line + boilerplate closing (`Other opportunities can be explored at go.gov.sg/pst-roles.`).

## Why this works

The single-call failure modes were **all** the result of conflating four skills into one output:
- Faithful reproduction of N long URLs verbatim → became a data-join problem on the runner.
- Curation judgment over many candidates → still LLM, but operates on slim CSV with integer IDs.
- Creative prose for the hook → still LLM, but isolated to a short, low-stakes call.
- Format compliance (≤2400 chars, no markdown, agency grouping) → became runner responsibility.

The model's only remaining job is "pick good row IDs" and "write 1-2 sentences". Both are well within a small free-tier model's capability. Previously-failing CF AI Gateway models (GLM 4.7 Flash, Nemotron 120B, Gemma-4 26B, Llama-4 Scout) **all** pass under this architecture — see [free-tier-model-eval](free-tier-model-eval.md).

## Why integer IDs and not URLs

User concern: "what if the model hallucinates row IDs?" The frame answer is to make hallucination cheap to detect and reject. Integers in `1..N` collapse the validation surface from "exact-match an 80-char URL string" to "is this integer in range?". Three layered backstops:
1. **Range validation** — drop any integer outside `1..jobs.length`.
2. **Dedup** — same integer twice counts once.
3. **Floor check + retry** — if fewer than ~6 valid integers remain after dedup, retry the call.

Side benefit: dropping URLs from the CSV shrinks input by ~50% (each URL ~125 chars; 86 jobs × 125 = 10K+ chars saved), giving reasoning models more budget for chain-of-thought before the completion cap.

## Why grouping is runner-side, not LLM-side

In single-call eval, models that *tried* to group by agency frequently hallucinated agency labels (Llama-4 Scout placed a CSIT role under a "Government Technology Agency" header). The agency is a column in the source data; the runner already has it via the row-id lookup; the LLM never needs to emit it. Removing the temptation removes the failure mode.

Section ordering: agencies sorted by listing count desc, ties broken by insertion order (first-pick wins) — natural visual hierarchy with big agencies anchoring the post, preserving the model's ranking signal as a tiebreaker.

## Configuration constants that matter

For reasoning-class models (GLM 4.7 Flash, Nemotron 120B, Gemma-4 26B), the listings call needs `max_tokens: 8192` and the intro call needs the same headroom. Lower values silently truncate with `finish_reason: length` and `content: null` — chain-of-thought eats the budget first. Llama-4 Scout works at lower limits (no reasoning channel).

Prompt contradictions are load-bearing: if the system message says "1-2 sentences" and the user message says "2-3 sentences", reasoning models spin on the conflict and exhaust their budget. Align both messages or push all constraints into one.

## What this lets the production code drop

Once ported, the following constraints in `generate-content.ts` become dead:
- The "CRITICAL RULE — EVERY JOB LISTING MUST HAVE ITS URL ON THE SAME LINE" block (URLs now always present, runner-written).
- The "HARD LENGTH CAP — at most 2400 characters" block (length controlled by listings count).
- The agency-grouping instruction (now runner-side).
- The post-processing markdown strip from [markdown-contamination](markdown-contamination.md) is *probably* no longer needed (intro call's tiny output surface gives little room to leak bold) — confirm empirically before removing.

The runner-side responsibilities grow: a new `rank-listings` step, the lookup join, grouping, and assembly. None require LLM calls.

## Related

- [free-tier-model-eval](free-tier-model-eval.md) — which model to pick
- [llm-segregation-goal](llm-segregation-goal.md) — why segregation is the goal
- [markdown-contamination](markdown-contamination.md) — why post-processing strips were necessary in single-call mode
