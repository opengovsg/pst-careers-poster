# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, GitHub Copilot, etc.) when working with code in this repository. `CLAUDE.md` and `.github/copilot-instructions.md` both resolve to this file.

## Commands

- `pnpm dev` — Nitro dev server.
- `pnpm build` — Nitro build for Vercel (entryFormat: node).

There is no test or lint script. Package manager is pnpm 10.

## Architecture

This service runs twice a week (Vercel cron, `vercel.json` — one cron per feature type) to post a featured slice of Singapore public-service IT jobs to social channels. The end-to-end flow is small but spans several non-obvious primitives.

### Request entry → durable workflow

- `nitro.config.ts` routes **all** paths to `src/index.ts` (an Express app) and registers `workflow/nitro`. The single endpoint `GET /api/generate` is gated by a `CRON_SECRET` bearer header and requires a `feature` query param of either `'job title'` or `'agency'`; the value is forwarded to `start(generatePost, [feature])`. Invalid/missing values 400.
- `src/index.ts` imports `./instrumentation.ts` first — this must stay first so the Langfuse/OTel `NodeSDK` boots before any instrumented module loads.
- `workflows/generate-post/index.ts` is annotated `'use workflow'`; each file under `workflows/generate-post/steps/` is annotated `'use step'`. These directives are enabled by the `workflow` TypeScript plugin in `tsconfig.json` and the `workflow/nitro` Nitro module. Treat them as load-bearing — they turn the functions into durably-executed, retryable steps. Do not remove them when refactoring.

### Feature selection has two divergent branches

`workflows/generate-post/index.ts` dispatches to `makeFeaturedPost` with the `featureType` passed in from the request (one invocation per cron — agencies on Tuesday, job titles on Thursday). Both paths go through `identifyFeatures` but the branches inside `findFeature` are deliberately different:

- **`'agency'`** uses the statistical mode (most common agency in the listings, excluding those seen in the past 45 days).
- **`'job title'`** matches each listing against a controlled vocabulary of canonical role tags in `workflows/generate-post/steps/identify-features/role-tags.ts`. A listing qualifies for a tag if its title matches, or its `jobRequirements` field has ≥2 keyword hits (single hits are usually incidental — agency boilerplate like CSA's "passion for cyber security" footer, or "basic knowledge of cybersecurity" in non-cyber engineering roles). The mode tag wins (excluding tags seen in the past 45 days), with ties broken by the latest `startDate` among matched listings. No LLM call — the vocabulary is the source of normalisation, so add a new `RoleTag` entry when a role type you want to feature is missing. `jobDescription` is intentionally not scanned because it's dominated by per-agency boilerplate that mentions every keyword.
- A `default:` branch in `findFeature` retains the original LLM path for future calls with `featureType=undefined`, to support open-ended trend identification that doesn't fit the two named buckets. Currently unreachable due to the union type, but the path and its `ai`/`zod`/`model` imports are load-bearing for that future use — do not strip them.

Both branches filter to the `IT_INDUSTRY` constant in `identify-features/index.ts` (`'InfoComm, Technology, New Media Communications'`). If you need a different vertical, change that constant.

### Step boundary: `identifyFeatures` returns jobs, `generateContent` serialises

`identifyFeatures` returns `{feature, jobs: Record<string, string>[]}` — the filtered listings with URL augmentation already applied. CSV serialisation lives inside `generateContent`, built immediately before `generateText()`. This split exists so the writer step owns its own input format: future work that wants to project columns, dedupe agency fields, switch to per-agency blocks, or emit JSON instead of CSV can do so without touching `identifyFeatures`.

Empty-result sentinel is `jobs.length === 0` (returned from both the no-input and no-feature paths in `identifyFeatures`). Callers must short-circuit on this before calling `generateContent`; the writer doesn't crash on empty input but would emit a header-only CSV to the model, producing degenerate output.

### Deduplication state lives in Cloudflare KV

`SimpleCloudflareKV` (inlined in `identify-features.ts`) writes the chosen feature into one of two namespaces (`CF_TITLES_KV`, `CF_AGENCIES_KV`) with a 45-day TTL via `expiration_ttl`. This is how the bot avoids re-featuring the same role/agency for ~6 weeks. The KV write is also the implicit "we committed to this feature" marker — it happens before the post is generated.

### LLM provider is OpenAI-compatible, not necessarily OpenAI

`workflows/shared/model.ts` calls `createOpenAI` with a custom `OPENAI_ENDPOINT`. Any OpenAI-compatible gateway (e.g., an internal OGP proxy) is the expected runtime. Do not assume openai.com.

### Two `makePost` implementations exist

- `workflows/generate-post/steps/make-post.ts` — submits to a **Fillout** form via `init` + `continue`. This is the one currently exported from `steps/index.ts` and used by the workflow.
- `workflows/generate-post/steps/make-post-linkedin.ts` — posts directly to the **LinkedIn Posts API** (`Linkedin-Version: 202601`), gated by `DRY_RUN` for `feedDistribution`. Not currently wired up.

If you switch the active implementation, change the export in `workflows/generate-post/steps/index.ts` — the workflow imports `makePost` from the barrel.

### Trusted external inputs

`JOB_LISTINGS_JSON_URL` resolves to an OGP-controlled GitHub URL. Treat the listings JSON as trusted infrastructure, not arbitrary user input — do not add sanitisation layers around it without a reason.

### Observability

`@langfuse/otel`'s `LangfuseSpanProcessor` is set to `flushAt: 1, exportMode: 'immediate'` because the process is a short-lived cron handler — spans must flush before the function exits.

## Deployment

Vercel. Two crons in `vercel.json` hit `/api/generate` with Vercel's cron `Authorization: Bearer $CRON_SECRET` header: `30 8 * * 2` (Tuesday 08:30 UTC) with `?feature=agency`, and `30 8 * * 4` (Thursday 08:30 UTC) with `?feature=job%20title`. CodeQL runs on PRs to `develop` (the trunk) via `.github/workflows/codeql.yml`.
