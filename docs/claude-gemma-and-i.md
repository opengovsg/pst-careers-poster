---
marp: true
theme: default
paginate: true
---

# Claude, Gemma & I
### Building an automated job-marketing team

A thrice-weekly bot that finds tech roles in the Singapore Public Service
and writes the LinkedIn posts that surface them.

<!-- Speaker note: this is a story about getting a small, free, unattended model
to do work that a frontier model did easily — and what broke along the way. -->

---

## Why we're doing this

- The Singapore Government hires a *lot* of tech talent — across ~90 agencies, many of them places you'd never think to look (HDB software engineers, MAS data scientists, intel agencies building LLM infrastructure).
- Those roles are scattered across a job portal nobody scrolls for fun.
- **Goal:** meet people where they already are (LinkedIn), and make a public-service tech career *legible* — show the actual work, not a wall of listings.
- It has to run on its own, several times a week, forever. No human in the loop on a Tuesday morning.

---

## The cast

| | Role | Think of them as… |
|---|---|---|
| **Me** | Director / editor | Sets the goal, judges the copy, makes the calls |
| **Claude** | The engineer | Builds the pipeline, debugs, tunes the prompts, reads the traces |
| **Gemma** | The copywriter | Does the actual writing — unattended, on the free tier |

> An automated marketing team: a director, an engineer, and a writer who works the night shift for free.

---

## What it produces

Three posts a week, each a different angle on the same job pool:

- **Tuesday** — a featured *agency* ("GovTech is hiring across its tech teams")
- **Wednesday** — a cross-cutting *hiring trend*
- **Thursday** — a featured *job family* ("Data Science roles across the Public Service")

Each post: a written **hook**, then a grouped, linked list of real openings.
Source data is an OGP-controlled feed of live listings — trusted infrastructure.

---

## v1: the prototype

- **Vercel cron** → a small durable workflow (Nitro + `workflow/nitro` steps).
- **Claude Sonnet** did it all in essentially one shot: read the listings, pick the interesting roles, *and* write the post.
- It worked. It read well. We shipped it.

> The whole thing fit in one capable model's head.

---

## The catch: Sonnet was overkill

- We were paying frontier-model prices to write ~3 short LinkedIn posts a week.
- The task isn't *that* hard — pick some rows, write two paragraphs.
- An unattended, low-stakes, high-cadence job is exactly the kind of thing that *should* run on a small, cheap (ideally free) model.

**The bet:** move to a free-tier open-weight model on Cloudflare AI Gateway.
**The candidate:** `gemma-4-26b`.

---

## Then we swapped the model in, and it broke

The same prompt that sang on Sonnet produced, on Gemma:

- listings the model half-invented or mangled,
- copy that was flat, generic, or occasionally just *empty*.

The lesson that framed everything after:

> A prompt carries the **fingerprint of the model it was tuned on.**
> Sonnet's competence had been quietly absorbing a lot of hidden cost.

---

## The fix people skip: take work *away* from the model

An LLM is the wrong tool for anything deterministic. It's slow, it burns tokens, and — worst — it can get it *wrong*. Picking by a rule, counting, grouping, formatting, de-duplicating, escaping a bracket: **code does every one of these perfectly, every time, for free.**

So the first move wasn't a cleverer prompt. It was drawing a hard line between what needs a brain and what needs a function — and giving the model back only the brain part.

---

## Who does what

| Code — deterministic, exact, free | Model — judgment only |
|---|---|
| *Which* agency / role family to feature (statistics + a controlled role-tag vocabulary) | Which open-ended **trend** is worth telling |
| Joining picked IDs → real titles, agencies, URLs | Which 6–10 roles to spotlight |
| Grouping, ordering, and formatting the listing | Writing the **hook** |
| 45-day de-duplication (Cloudflare KV) | |
| Stripping stray markdown, escaping parens for LinkedIn | |

The right column is short on purpose. Everything that *can* be code, is.

---

## The trick that ties it together: integer row-IDs

The model never writes a URL, and never retypes a title it could mangle.
It picks **row numbers** off a list — "give me 6 to 10 integers" — and code joins the real title, agency, and link back.

- Keeps the model **focused**: pick numbers, nothing else.
- Makes the output **safe**: it can't corrupt a link it never touches.

> Don't ask a small model to be careful. Arrange things so it *can't be careless.*
> Then reserve it for the only two things that genuinely need judgment: **what's interesting**, and **how to say it**.

---

## Prompt tuning, Act I — the "Warm Dead Bird"

- Gemma's copy was accurate and lifeless. (As the saying goes: if Commodore bought KFC, they'd rename it *Warm Dead Bird*.)
- The fix wasn't fancier words — it was **substance**. We fed the writer each role's real responsibilities and each agency's own description.
- Flatness was a property of the source's *voice*, not its *facts*. The facts (named systems, real domains) were there to be mined.

---

## Prompt tuning, Act II — the don't-list trap

The original prompt was a long list of *don'ts* (no buzzwords, no markdown, never like a recruiter…).

- **Sonnet** absorbed those as a faint prior and wrote fluently.
- **Gemma** treated each one as a checklist item to verify — and on the fuzzy ones, it couldn't decide when it was *done*, so it re-checked forever and ran out of budget. **Empty post.**

> Negative + fuzzy constraints define the target by exclusion — unbounded and unverifiable.
> **Positive, crisp, structural rules** the model can check in one pass.

---

## Prompt tuning, Act III — temperature & traces

- "Never like a recruiter" → a literal model suppressed *all* energy. We split warmth from sales talk explicitly.
- The self-critique loop was structural. **Raising temperature to 1.0** flattened the distribution enough for the model to commit and stop — the variety dial doubled as the escape hatch.
- Every fix was paid for by **reading the model's reasoning traces**, not guessing. The loop and the flatness look identical from the output alone.

---

## What we learned

- **Most of "getting an LLM to work" isn't an LLM problem.** The biggest win was deciding what the model should *never touch* and handing it to code. Reserve the model for judgment.
- Match the model to the job — frontier models are overkill for narrow, repetitive tasks.
- Prompts are model-specific assets; a model swap is a rewrite, not a config change.
- Tell a literal model what to **do**, not a pile of what to avoid.
- Show, don't tell — ground the writer in real source facts.
- Read the traces. Tune with cheap, repeatable evals.

---

## The team today

- **Me** — still editing, still the taste.
- **Claude** — built the pipeline, and reads Gemma's mind via the traces.
- **Gemma** — writing three posts a week, unattended, for ~free.

**Next:** a local Gemma (Ollama) so the tune → run → eval loop can run on its own — the engineer training the night-shift writer without anyone watching.

> *Still a work in progress — we were literally mid-tuning when these slides were written.*
