# "Non-obvious" invites hallucination

- **Theme:** Prompt engineering / hallucination
- **Captured:** 2026-05-26 (point-in-time; verify against current code)
- **Status:** Standing guidance; led to dropping "and non-obvious" from INTRO_SYSTEM (commit 928d835).

When an intro/hook prompt asks for something "specific and non-obvious" about a body of work, the model has three response strategies:

1. Lean on shared vocabulary actually present in the input (works when input is homogeneous — e.g. eight cybersecurity listings let Gemma anchor on "red team", "malware", "maritime").
2. Stay abstract and generic (the older failure mode — "shape the future", "critical infrastructure").
3. **Fabricate a non-obvious-sounding fact by combining true nouns with a false connector** — e.g. "manage national identity and critical economic workflows simultaneously". Each noun is true individually; the word "simultaneously" invents an architectural property (one system spanning identity + money) that doesn't exist. SingPass and the IRAS/GST stack are deliberately separate.

The 2026-05-26 GovTech agency-post failure was strategy (3). The user caught it on the connective, not the nouns: "There is no system at GovTech that handles both money and identity at the same time."

**Why:** Heterogeneous agency listings give the model no shared vocabulary to anchor on (unlike a job-title feature where all listings share a domain). When abstraction is socially forbidden by the prompt and shared vocabulary is unavailable, the only remaining strategy is invention. The "non-obvious" cue is doing the harm — it implicitly asks the model to know things it doesn't know.

## How to apply

- When reviewing prose output for hallucination, check **connectives** (`simultaneously`, `at the same time`, `in real-time`, `seamlessly`, `unified`) — these are the load-bearing words that turn two true facts into one false architectural claim. The nouns will usually be fine; the verbs and adverbs are where the lie lives.
- Don't assume the cybersecurity-specialist eval generalises to agency features. Job-title features have shared vocabulary; agency features don't. Different prompts probably needed.
- When designing intro prompts that work across feature types, prefer instructions the model can satisfy from input alone ("describe what these roles concretely involve") over instructions that require world knowledge ("name something non-obvious about this work").

## Related

- [intro-prompt-regression-check](intro-prompt-regression-check.md) — the commit that dropped the cue
