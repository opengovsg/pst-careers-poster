# IBM Granite capabilities (intro-prose eval)

- **Theme:** LLM evaluation / model selection
- **Captured:** 2026-05-26 (point-in-time; verify against current code)
- **Status:** Single-sample CF AI Gateway eval of `granite-4.0-h-micro` on the production intro prompt. Failed on structure, voice, and specificity all at once.

## What was tested

CF AI Gateway compat-chat call, `workers-ai/@cf/ibm-granite/granite-4.0-h-micro`, temperature 0.7, max_tokens 8192. Production intro prompt verbatim, 8 cyber-specialist listings spanning CSA / CSIT / GovTech / HTX / MINDEF with junior→senior spread.

Ranking call was skipped — user ran the intro prompt directly in the CF playground after the eval script hit the Workers AI daily neuron quota.

## Verbatim output (single sample)

> Singapore's public sector is pioneering real-time threat intelligence integration, turning data into fortified defenses before attacks strike.

## Three failure modes in one sample

1. **Structural non-compliance.** Prompt mandates "exactly two paragraphs separated by a blank line, each 1-3 sentences". Granite emitted one sentence, no blank line. The constraint is in the system prompt and was ignored on first roll.
2. **Buzzword voice.** "Pioneering", "real-time threat intelligence integration", "turning data into fortified defenses before attacks strike" is the exact recruiter-press-release register the prompt forbids ("Write like a sharp journalist, not a recruiter. No buzzwords."). Reads as boilerplate corporate cyber comms.
3. **Zero listing specificity.** Input named cyber exercises, penetration testing, CISO governance, advanced cyber capabilities, security ops — five concrete sub-domains. Output mentions none. The line is interchangeable with any cyber post in any country in any year.

## General read on IBM Granite as an organisational capability

IBM's open-weight line (Granite 3.x, 4.x) is positioned by IBM itself as enterprise/B2B tooling — marketing leans on "business applications", "code", "RAG", "tool calling", "structured outputs". The voice failure here is not random: "pioneering / fortified defenses" *is* the register IBM's own corporate communications use, a plausible artefact of post-training data heavy on enterprise marketing and analyst-report prose. The structural non-compliance is harder to explain charitably — even small instruct models from other labs (Llama Scout 17B, Gemma 26B) followed the two-paragraph rule on the same prompt.

**Practical implication:** for prose tasks where voice and rhetorical constraint matter (LinkedIn post hooks, recruitment copy, journalistic-tone content), reach past the Granite line. For structured outputs, function calling, or RAG-style enterprise applications, the Granite line might still be competitive — those modes weren't tested. The 2026-05-18 CF AI Gateway shortlist for *this* project's needs stands: Gemma-4 26B and Nemotron 120B remain the only candidates with intro voice worth shipping; Granite sits below Llama-4 Scout's floor.

## Caveats

- **N=1.** A second sample at higher temperature might land structure correctly. The voice failure is more likely sticky (training-data shape) than the structural one.
- **Micro tier.** Granite 4.0 H Micro is the *smallest* in IBM's 4.0 lineup. If CF Workers AI lists a `granite-4.0-h-small` or larger, retesting is cheap. That said, voice problems often persist across sizes within a family because they're post-training artefacts, not capacity artefacts.
- **No reasoning channel.** Granite is non-reasoning, so the 8192 max_tokens ceiling is just headroom — output budget wasn't the limiter.

## Related

- [free-tier-model-eval](free-tier-model-eval.md) — the standing shortlist
