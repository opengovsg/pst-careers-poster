# Markdown contamination in reasoning models

- **Theme:** LLM evaluation / model behaviour
- **Captured:** 2026-05-16 (point-in-time; verify against current code)
- **Status:** Confirmed in GLM 4.7 Flash on the LinkedIn-post eval (2026-05-17). Generalises to other reasoning models, Claude included.

## The diagnostic

When a reasoning model produces output that violates a "no markdown" / "no emphasis formatting" / "no emoji" / "no em-dash" style rule, the failure is often **not** a misunderstanding of the rule. It's a *contamination* between the model's own reasoning format and the output it's writing inside that reasoning:

- The model's scratchpad / chain-of-thought uses `**bold**`, `## headers`, `*   bullets` natively as structural notation.
- When it drafts the output text *inside* that scratchpad, the same markers in the draft become indistinguishable from the markers structuring its own thinking.
- The model's final self-check pass operates on its *mental model* of the draft, not the literal text — so it sincerely asserts compliance while the violation sits right there in the output.

**Smoking-gun pattern:** the reasoning trace contains a final checklist that ticks off the prohibition, immediately followed by output that violates it.

**Why prompt-tuning doesn't fix this:** the model already understands the rule. It reads it correctly, reminds itself before drafting, asserts satisfaction at the end, and emits the violation in between. Adding emphasis ("REALLY DO NOT USE \*\*") makes no difference — the issue isn't comprehension; it's that the self-review can't see its own scratchpad notation as a violation.

## Evidence

**GLM 4.7 Flash via Cloudflare AI Gateway (2026-05-17 eval, sample 2).** Reasoning trace recovered from raw response.
1. Trace reads the rule — `*   **Language:** Plain text. No bolding (NO **, __).`
2. Self-reminder before drafting — `*   *Constraint Check:* Do not use **. No emphasis.`
3. Every draft attempt uses `**Agency Name**` style bold headers.
4. Final formatting check ticks `- No **.` / `- No __.` — while the output had three bold headers.

## Generalisability

Plausibly not unique to GLM 4.7 Flash. Any reasoning model whose scratchpad uses markdown structurally is at risk. **Claude is not immune in principle.** Relative reliability comes from transferred intuition out of format-strict training (code, JSON), not a structural firewall between thinking-format and output-format. The transfer is narrow: prose with unusual formatting prohibitions ("no markdown bold, but plain dashes are fine") is exactly the edge case where the learned habit may not have generalised.

When evaluating models for tasks with this class of rule: **do not trust model self-reports of compliance.** Always scan the actual output for the prohibited pattern.

## Corollary: post-processing strip

For rules of the form *"do not emit syntactic pattern X in the output"* — markdown bold/italic, emoji, em-dashes, particular punctuation — a one-line regex strip on model output is more robust than any prompt or model choice:

```js
text.replace(/\*\*/g, '').replace(/__/g, '')   // strip bold/underline markers
text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')    // strip emoji
text.replace(/—/g, '-')                         // em-dash → hyphen
```

The strip removes the question entirely — no self-reporting to trust, no model to bench, no regression risk on upstream model updates.

**Apply when:** the rule is a regex substitution and the substitution doesn't risk corrupting legitimate content (`**` is never legitimate in plain-text LinkedIn output; em-dashes are stylistic and safe to normalise).

**Don't apply when:** the rule requires semantic judgement ("no jargon", "be concise", "stay on topic").

## How to apply

1. When a free-tier or reasoning model fails a "no X formatting" rule, default to recommending a post-processing strip rather than another prompt iteration.
2. When evaluating new models, factor the *availability of a clean post-processing fallback* into viability — a regex-fixable failure is more viable than a semantic-judgement failure of equivalent severity.
3. If the user resists the strip (as 2026-05-17 — "don't change anything for now"), record the rationale but don't push; it's a genuine complexity-vs-robustness judgement call.

## Related

- [free-tier-model-eval](free-tier-model-eval.md) — the eval that surfaced this
- [gemma-literalness-levers](gemma-literalness-levers.md) — post-processing beats prompt-tuning for syntactic rules
