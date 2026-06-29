# Project notes

Working notes distilled from accumulated agent memory for pst-careers-poster.
Each note is a point-in-time observation with a captured date — claims about
code behaviour or file:line citations may be stale; verify against current
code before treating as fact. Cross-references between notes are plain relative
links.

## LLM evaluation & model selection

- [free-tier-model-eval](free-tier-model-eval.md) — the full free-tier eval log: every model tried on CF AI Gateway / OpenRouter, single-call failure modes, and the two-call rework that made all four CF models viable.
- [two-call-architecture](two-call-architecture.md) — rank integer row-IDs, then write a hook, then assemble deterministically; the pattern that unlocked the small models.
- [markdown-contamination](markdown-contamination.md) — reasoning models go blind to markdown they emit; a regex strip beats prompt-tuning for syntactic rules.
- [ibm-granite-capabilities](ibm-granite-capabilities.md) — Granite 4.0 micro failed structure + voice + specificity; IBM's line is tuned for enterprise prose.
- [panel-judge-fusion-limits](panel-judge-fusion-limits.md) — panels converge on content, so the judge becomes a bland linter; net-negative on voice generation.

## Prompt engineering & voice

- [gemma-literalness-levers](gemma-literalness-levers.md) — flat voice from blunt negative rules; truncation from fuzzy bans; fixes are crisp structural rules, temperature 1.0, empty-output retry.
- [non-obvious-invites-hallucination](non-obvious-invites-hallucination.md) — "specific and non-obvious" makes models glue true nouns with false connectives; check the connectives.
- [intro-prompt-regression-check](intro-prompt-regression-check.md) — dropping "and non-obvious" was validated only on agency input; the job-title cron is the regression checkpoint.
