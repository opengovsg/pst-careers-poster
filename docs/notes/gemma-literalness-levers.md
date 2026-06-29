# Gemma literalness levers

- **Theme:** Prompt engineering / voice
- **Captured:** 2026-06-04 (point-in-time; verify against current code)
- **Status:** Diagnosed from reasoning traces 2026-06-04 (intro-voice work; commits 148d6a8, e31a96a, 7af32fe).

gemma-4-26b follows instructions hyper-literally, which produces two recurring failure modes when tuning the intro prompt.

**1. Blunt negative style rules get over-applied.** "Never like a recruiter" made the model suppress *all* energy and default to flat documentation voice — it read any warmth as recruiter-risk. Fix: say what is *wanted* (warmth, curiosity) and name only the actual banned tells (hype words, "join us", job-ad phrasing). Decouple the good from the bad explicitly.

**2. Fuzzy/negative syntactic prohibitions cause unbounded self-critique loops.** "Do not use a 'doing X needs Y' frame" was unverifiable — the model couldn't decide what matched ("relies on"? "depends on"?), so it re-checked every phrase, drafting a usable hook many times but never emitting, until it hit the token cap (`finish_reason: 'length'`, empty output) ~1/3 of runs. Fix: prefer **crisp structural rules verifiable in one check** (e.g. "first sentence must not name any tool or technical term") over fuzzy stylistic bans.

**Why:** the self-critique loop is structural to a literal model on a multi-constraint *stylistic* task — stylistic rules can never be definitively satisfied, so they feed the loop.

## How to apply

- **Temperature is the lever.** Raising the intro call to 1.0 flattens the distribution enough that the model samples the "this is done, emit" path instead of looping (3/3 vs 2/3 at 0.7 in eval). It's the variety/creativity dial and the antidote to the literal rut.
- Always pair a stylistic call with an **empty-output retry guard** (re-roll on empty/`length`; a fresh sample almost always converges) + a graceful fallback. The intro call does this (`INTRO_MAX_ATTEMPTS`, title-only fallback).
- **Read the reasoning traces** before reaching for a fix — the loop vs a substrate/ceiling problem look identical from the output alone. Eval harness: `scripts/eval-intro.mjs` (reads `/tmp/content-input-prompt.txt`, dumps reasoning to `/tmp/eval-reasoning-*.json`, `EVAL_TEMP` env). Future goal: local Ollama-hosted Gemma to automate tune→eval→repeat without gateway/credit cost.

## Related

- [markdown-contamination](markdown-contamination.md) — post-processing beats prompt-tuning for syntactic rules
- [non-obvious-invites-hallucination](non-obvious-invites-hallucination.md) — temp 1.0 widens the fabrication surface; keep checking connectives
- [two-call-architecture](two-call-architecture.md)
