# Intro-prompt regression check

- **Theme:** Prompt engineering / regression watch
- **Captured:** 2026-05-26 (point-in-time; verify against current code)
- **Status:** Watch item. The 2026-05-28 Thursday job-title cron was the natural regression checkpoint.

## What changed and why

Commit `928d835` (2026-05-26) edits `INTRO_SYSTEM` in `workflows/generate-post/steps/generate-content.ts`: removes ` and non-obvious` from the first-paragraph instruction. Full diagnostic in [non-obvious-invites-hallucination](non-obvious-invites-hallucination.md). Eval samples at `/tmp/linkedin-eval/govtech/`.

**Why:** Tuesday 2026-05-26 GovTech agency-feature production output fabricated an architectural coupling between Singpass and Digital Economy Products ("manage national identity and critical economic workflows simultaneously"). The reasoning trace showed Gemma writing usable early drafts and then iteratively revising them away in pursuit of "non-obviousness". Dropping the cue cleared the failure modes 0/5 across 5 samples on the same listings.

**How to apply:** The change was validated only on agency-feature input (8 GovTech listings); job-title-feature voice was not re-tested. The 2026-05-28 Thursday cron was the first job-title-feature run after the change. Watch for the opposite failure: voice going flat / generic on the homogeneous job-title input that previously produced sharp "tension/trade-off" openers under the older prompt. If P1 reads as "the roles include X, Y, Z" with no hook quality, the "non-obvious" cue was load-bearing for job-title features and a feature-type split becomes the next consideration (the user has signalled preference for a single prompt).

Carry-overs not addressed by this commit:
- Agency name absent in 0/5 of both prod and variant samples — production posts on agency features still need a manual "At <Agency>" prefix at the Fillout step. Separate problem.
- Reasoning-spiral failure modes beyond "non-obvious" (sharp-journalist cue → false-contrast; vary-length cue → terseness-jargon like "national-scale software") remain untouched.

## Related

- [non-obvious-invites-hallucination](non-obvious-invites-hallucination.md)

