# ADR 0001: Controlled vocabulary for feature selection

## Status

Accepted (implemented in commit `96564a4`).

## Context

`identifyFeatures` picks the topic of each cron run — either an "agency" (most agencies hiring this week) or a "job title" (most common role type this week). The chosen feature gates which listings appear in the post.

The original implementation handed a CSV of all candidate listings to an LLM and asked it to identify the trending feature. Two problems surfaced:

- **Non-determinism.** Repeated runs against the same input could pick different features. Hard to review, hard to debug, hard to test.
- **Cost and latency.** Every cron run burned a long-context LLM call just to compute a single label, on top of the writer call.

Domain knowledge (the set of role types we want to feature, and the criteria for matching listings) was implicit in the LLM's pretraining rather than expressed in code.

## Decision

Replace the LLM call with deterministic logic in `findFeature`:

- **`agency` feature type**: take the statistical mode of the `agency` field across the candidate listings, excluding agencies featured within the past 45 days (tracked in Cloudflare KV).
- **`job title` feature type**: match each listing against a controlled vocabulary of canonical role tags in `workflows/generate-post/steps/identify-features/role-tags.ts`. A listing qualifies for a tag if its `jobTitle` matches any of the tag's regex patterns, or its `jobRequirements` field has ≥2 keyword hits. The mode tag wins, with ties broken by the latest `startDate` among matched listings.
- **Default case** (`featureType` undefined): retain the original LLM path as a hook for future open-ended exploration (e.g. "is an agency building a new team?"). Currently unreachable due to the union type on `featureType`, but the path and its `ai`/`zod`/`model` imports are kept deliberately.

`jobDescription` is intentionally not scanned because it is dominated by per-agency boilerplate that mentions every keyword. The ≥2-hit threshold on `jobRequirements` rejects incidental mentions like "passion for cyber security" in CSA's standard agency footer — single hits would otherwise pollute the mode counts and surface non-cyber roles under cyber feature runs.

## Consequences

- Cron runs make one LLM call (the writer) instead of two. The writer's model choice can change without affecting feature selection.
- Feature selection is reproducible: same input, same feature.
- Adding a new role type to feature is a config change — append an entry to `ROLE_TAGS` with regex patterns. No prompt engineering required.
- Vocabulary completeness is load-bearing. A missing role tag means that role type is silently never featured on the `'job title'` branch (and now also affects visibility on the `'agency'` branch — see ADR-0002).
- The default-branch LLM path is unreachable today but kept on purpose. Removing it would also require removing its `ai`/`zod`/`model` imports, which would make the future re-enablement a larger change than a one-line type update.
