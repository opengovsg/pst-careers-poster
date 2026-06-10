# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, GitHub Copilot, etc.) when working with code in this repository. `CLAUDE.md` and `.github/copilot-instructions.md` both resolve to this file.

## Commands

- `pnpm dev` — Nitro dev server.
- `pnpm build` — Nitro build for Vercel (entryFormat: node).

There is no test or lint script. Package manager is pnpm 10.

## Architecture

This service runs three times a week (Vercel cron, `vercel.json` — one cron per feature type) to post a featured slice of Singapore public-service IT jobs to social channels. The end-to-end flow is small but spans several non-obvious primitives.

### Request entry → durable workflow

- `nitro.config.ts` routes **all** paths to `src/index.ts` (an Express app) and registers `workflow/nitro`. The single endpoint `GET /api/generate` is gated by a `CRON_SECRET` bearer header and requires a `feature` query param of `'job title'`, `'agency'`, or `'trend'`; the value is forwarded to `start(generatePost, [feature])`. Invalid/missing values 400.
- `src/index.ts` imports `./instrumentation.ts` first — this must stay first so the Langfuse/OTel `NodeSDK` boots before any instrumented module loads.
- `workflows/generate-post/index.ts` is annotated `'use workflow'`; each file under `workflows/generate-post/steps/` is annotated `'use step'`. These directives are enabled by the `workflow` TypeScript plugin in `tsconfig.json` and the `workflow/nitro` Nitro module. Treat them as load-bearing — they turn the functions into durably-executed, retryable steps. Do not remove them when refactoring.

### Feature selection has three divergent branches

`workflows/generate-post/index.ts` dispatches to `makeFeaturedPost` with the `featureType` passed in from the request (one invocation per cron — agencies on Tuesday, trends on Wednesday, job titles on Thursday). All paths go through `identifyFeatures` but the branches inside `findFeature` are deliberately different:

- **`'agency'`** uses the statistical mode (most common agency in the listings, excluding those seen in the past 45 days).
- **`'job title'`** matches each listing against a controlled vocabulary of canonical role tags in `workflows/generate-post/steps/identify-features/role-tags.ts`. A listing qualifies for a tag if its title matches, or its `jobRequirements` field has ≥2 keyword hits (single hits are usually incidental — agency boilerplate like CSA's "passion for cyber security" footer, or "basic knowledge of cybersecurity" in non-cyber engineering roles). The mode tag wins (excluding tags seen in the past 45 days), with ties broken by the latest `startDate` among matched listings. No LLM call — the vocabulary is the source of normalisation, so add a new `RoleTag` entry when a role type you want to feature is missing. `jobDescription` is intentionally not scanned because it's dominated by per-agency boilerplate that mentions every keyword.
- **`'trend'`** uses the LLM to identify ONE open-ended hiring trend — a cross-cutting narrative spanning multiple agencies, a capability buildout cutting across job titles, or a structurally rich sub-story within a single agency. The CSV passed to the model is the richest of the three branches: a leading integer `id` column then `jobTitle, agency, functionalArea, field, jobRequirementsSnippet` (HTML-stripped, truncated to 200 chars). The prompt explicitly steers away from mode-of-title and mode-of-agency framings (those are the other two branches and would be redundant), and rejects single-agency rosters that masquerade as sub-stories. The schema is `{feature: string, ids: number[]}` — the model returns the integer row ids, not the opaque `jobId`/`postingNo` identifiers (the integer row-ID frame from ADR-0003; see its trend addendum for why a nested `{jobId, postingNo}[]` schema failed on small models). The runner maps ids back to canonical `{jobId, postingNo}` with range-validation and dedup; `findFeature` still returns the `{feature, listings: [{jobId, postingNo}]}` shape internally. The feature string is intentionally a 1-2 sentence narrative carrying headline + rationale together — `generateContent` feeds it to the intro writer as the steering `Feature:` line (see the intro call below; it is no longer published raw, because the raw analyst string came out abstract and place-less — "cross-agency maturation of AI capabilities…" with no sign it was the Singapore public service).

Both deterministic branches dedup via Cloudflare KV (45-day TTL). **Trend skips the KV step entirely** — no namespace, no read, no write. Trend output is naturally varied week-to-week and fuzzy-string collisions across weeks would be confusing to gate on. The user accepts story variance over deduplication for this mode.

All three branches filter to a "tech role" pool defined by `findFeature` as `industry === IT_INDUSTRY` **OR** matches any `ROLE_TAG`. The role-tag leg is what catches IT-shaped roles that agencies file under their org's primary industry (HDB software engineers under `Engineering`, MAS data analysts under `Accounting`, MilSec infosec under `Enforcement`). This means `ROLE_TAGS` is load-bearing not just for *feature selection* on the `'job title'` branch, but also for *visibility* of non-IT-industry listings on the `'agency'` and `'trend'` branches — a missing tag silently excludes such listings from all three paths. If you need a different vertical, change `IT_INDUSTRY` or extend `ROLE_TAGS`.

### Two-call architecture: `generateContent` ranks then writes

`identifyFeatures` returns `{feature, jobs: Record<string, string>[]}` — the filtered listings with URL augmentation already applied. `generateContent` then makes **two** narrow LLM calls and assembles the post deterministically:

1. **Listings call** — slim CSV (id, jobTitle, agency, remainingDays, experienceYearsMin/Max) with a leading integer `id` column. The model is asked to output 6-10 integer ids, one per line — no titles, no URLs, no prose. The runner validates each id against an `idToRow` map, dedups, and joins back to canonical `{jobTitle, agency, url}` from the source data. URLs are never reproduced by the model. The call is retried once if fewer than 6 valid ids parse after dedup (best-of-N across attempts); throws only if every attempt yields zero.
2. **Intro call** — receives the chosen roles as enriched substrate (no URLs, no CSV): each agency's own `agencyDescription` (deduped, truncated to `AGENCY_DESC_CHARS`) plus a per-role `jobResponsibilities` summary (truncated to `RESP_SNIPPET_CHARS`), and writes a two-paragraph hook. The model is told to *extract* the concrete specifics buried in the deliberately-dull source text — systems, tools, domains, who the work serves — and re-voice them with energy, never reusing the phrasing and never inventing claims not in the text. The field choice is empirical: `jobResponsibilities` is the most fact-dense field (named systems/tools), `agencyDescription` is the agency's *self-authored* blurb (so it is the safe, sourced substitute for the model's parametric knowledge — this is what makes low-profile intel/security agencies like CSIT/SID/ISD safe to feature without the model guessing about classified work). `jobDescription` (often just the title echoed back) and `jobRequirements` (generic candidate spec, reusable across employers) are deliberately *not* fed — neither carries differentiating substance. The `agencyDescription` is also the **mission anchor**: the prompt steers the hook to make the public purpose unmistakable (whose security, whose health, which economy) drawn only from those descriptions — this is what keeps the output recognisably Singapore-public-service rather than generic tech, and is sourced so it does not fabricate. The intro call runs at `temperature: 1.0` with an empty-output re-roll (`INTRO_MAX_ATTEMPTS`): the multi-constraint stylistic task sends gemma-4-26b into an unbounded self-critique loop ~1/3 of the time at 0.7 (drafting a hook, re-checking it against every rule until it burns the budget and returns empty); 1.0 lets it commit, and the re-roll (falling back to a title-only header, or the raw narrative for trend) covers the residual. **All three feature types call this writer** — `'trend'` feeds its 1-2 sentence narrative as the `Feature:` steering line rather than publishing it raw (it was abstract and place-less); the writer re-grounds it in the agencies' missions and the roles' responsibilities. So every mode is two LLM calls (rank + intro).
3. **Deterministic assembly** — header + blank line + grouped listings + blank line + boilerplate closing. The grouping key depends on the feature: `'agency'` groups by **discipline** (`disciplineOf`, the same role-tag matcher used for selection — title match wins over a requirements-keyword match), while `'job title'` and `'trend'` group by **agency**. (Trend deliberately groups by agency, not discipline: discipline groups bunch together near-identical titles that differ only by team name, so the agency → title+team hierarchy reads better.) Each group is a section header with `- Title - URL` lines underneath; sections are ordered by count desc with insertion-order ties, except the `Other Roles` catch-all which always sorts last. A single-group pick (e.g. a single-agency trend) emits a flat bullet list with no header. For `'agency'`/`'job title'`, header is `<title-template>\n\n<intro-hook>`; for `'trend'`, header is just the `<intro-hook>` (no title template — the trend narrative was already spent as the writer's steering line, so the written hook stands alone; if the writer returns empty after all re-rolls, it falls back to the raw narrative). Parens are escaped at the end for the Fillout → LinkedIn route.

`maxOutputTokens` is `8192` for both calls. These tolerate reasoning-class models that burn the completion budget on chain-of-thought before emitting any user-facing token; lower values silently truncate with `finish_reason: length`. The intro call needs this same headroom because the two-paragraph rhythm-aware prompt sends Gemma's reasoning into a draft→critique→redraft loop that 4096 tokens couldn't contain (1-in-3 empty-output rate observed in eval; cleared at 8192). Llama-class non-reasoning models are unaffected by the larger limits.

The constraints that used to live in `generateContent`'s prompt (URL preservation, 2,400-char cap, agency grouping, markdown bans, British English) are now either deterministic concerns (URL/length/grouping) or moot because the intro's tiny output surface gives the model no room to misbehave.

Empty-result sentinel is `jobs.length === 0` (returned from both the no-input and no-feature paths in `identifyFeatures`). Callers must short-circuit on this before calling `generateContent`; the writer would otherwise emit a header-only CSV to the model and almost certainly throw the no-valid-ids error after retries.

### Deduplication state lives in Cloudflare KV

`SimpleCloudflareKV` (inlined in `identify-features.ts`) writes the chosen feature into one of two namespaces (`CF_TITLES_KV`, `CF_AGENCIES_KV`) with a 45-day TTL via `expiration_ttl`. This is how the bot avoids re-featuring the same role/agency for ~6 weeks. The KV write is also the implicit "we committed to this feature" marker — it happens before the post is generated. **Trend mode does not use KV** — see the feature-selection section above.

### LLM provider is Cloudflare AI Gateway

`workflows/shared/model.ts` wires the model through Cloudflare's AI Gateway via `ai-gateway-provider`'s `createAiGateway` + `createUnified`. Required env vars: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CF_AI_MODEL_NAME` (the unified provider's `provider/model` slug). The gateway name is hard-coded to `default`. Do not reintroduce `createOpenAI`/`OPENAI_ENDPOINT` plumbing — the gateway handles routing across upstream providers.

### Two `makePost` implementations exist

- `workflows/generate-post/steps/make-post.ts` — submits to a **Fillout** form via `init` + `continue`. This is the one currently exported from `steps/index.ts` and used by the workflow.
- `workflows/generate-post/steps/make-post-linkedin.ts` — posts directly to the **LinkedIn Posts API** (`Linkedin-Version: 202601`), gated by `DRY_RUN` for `feedDistribution`. Not currently wired up.

If you switch the active implementation, change the export in `workflows/generate-post/steps/index.ts` — the workflow imports `makePost` from the barrel.

### Trusted external inputs

`JOB_LISTINGS_JSON_URL` resolves to an OGP-controlled GitHub URL. Treat the listings JSON as trusted infrastructure, not arbitrary user input — do not add sanitisation layers around it without a reason.

### Observability

`@langfuse/otel`'s `LangfuseSpanProcessor` is set to `flushAt: 1, exportMode: 'immediate'` because the process is a short-lived cron handler — spans must flush before the function exits.

## Deployment

Vercel. Three crons in `vercel.json` hit `/api/generate` with Vercel's cron `Authorization: Bearer $CRON_SECRET` header: `30 8 * * 2` (Tuesday 08:30 UTC) with `?feature=agency`, `30 8 * * 3` (Wednesday 08:30 UTC) with `?feature=trend`, and `30 8 * * 4` (Thursday 08:30 UTC) with `?feature=job%20title`. CodeQL runs on PRs to `develop` (the trunk) via `.github/workflows/codeql.yml`.
