# Panel + judge ("fusion") limits

- **Theme:** LLM evaluation / multi-model synthesis
- **Captured:** 2026-06-24 (point-in-time; verify against current code)
- **Status:** Empirically tested. General cross-project finding, not pst-specific.

Empirically evaluated the panel+judge "fusion" pattern (K diverse models answer in parallel, a judge synthesizes one answer — OpenRouter Fusion / freellmapi#326) on free OpenRouter models, June 2026.

**Finding:** panels converge on *content*, not just on objective answers. On well-posed prompts (reasoning AND open-ended writing) diverse free models said the same things in different words — no distinct angles to combine, no contradictions to resolve. So the judge stops being a synthesizer and becomes a compressor/linter. Record on 3 open-ended tasks: 1 loss, 1 tie, 1 marginal win.

- On voice-dependent generation (a hook from dull source — this project's core task) fusion was a **net negative**: the judge flattened the distinctive voice toward a dull source-echo and even introduced a repetition defect. A single well-prompted model beat panel+judge, at ~8× less wall-time and 5× fewer calls.
- The judge is the safe-but-bland choice *by construction*: it stays factual (safer on fabrication) but flat (worse on voice).
- Synthesis can ADD defects, not just lose quality.
- The judge's genuine value was constraint-enforcement (pulling over-length drafts back to spec) — a linter, not "near-frontier synthesis."
- Operationally the judge is the latency tail + single point of failure. Reasoning-class judges return EMPTY if the output budget is too low (fixed by raising maxOutputTokens 2500→8192; the empty-output re-roll then never fired — budget was the root cause, same split as [gemma-literalness-levers](gemma-literalness-levers.md)).

**Why:** the value proposition ("near-frontier quality for free") assumes panel *idea*-diversity that doesn't materialize when models converge — which they do on single, well-posed prompts.

**How to apply:** don't reach for panel+judge to improve single-prompt voice/generation; the lever there is prompt + model choice. Reserve panel+judge for genuine idea-divergence work (research, multi-source analysis, error-correction on hard divergent problems). When suggesting it, price in K+1× tokens/calls and the judge latency tail.

## Related

- [gemma-literalness-levers](gemma-literalness-levers.md)
