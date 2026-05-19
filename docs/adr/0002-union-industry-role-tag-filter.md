# ADR 0002: Union industry + role-tag filter for tech-role classification

## Status

Accepted (implemented in commit `4cfce7f`).

## Context

Job listings in the Singapore Public Service feed have an `industry` field that is assigned by the listing agency, not by the role itself. The `IT_INDUSTRY` constant (`"InfoComm, Technology, New Media Communications"`) was historically the sole filter defining the "tech role" pool that feeds `findFeature` (see ADR-0001).

A snapshot survey of the listings found that many IT-shaped roles are filed under their agency's primary industry rather than under `IT_INDUSTRY`:

- HDB software engineers under `Engineering`
- MAS data analysts under `Accounting`
- HTX cybersecurity under `Others`
- MilSec infosec under `Enforcement`

These listings were silently excluded from both feature types — `agency` mode counts and `job title` tag matches alike. The `'agency'` branch in particular under-counted agencies like HDB, MAS, and MilSec, even when their IT hiring activity was significant.

## Decision

Broaden the "tech role" filter to a union: a listing qualifies if `industry === IT_INDUSTRY` **OR** it matches any `ROLE_TAG`. The role-tag leg catches IT-shaped roles regardless of the agency's industry classification.

The same `matchesRoleTag(job, tag)` helper that powers ADR-0001 is reused here. No new vocabulary is introduced.

A precondition tightening to the `IT Lecturer` regex (drop `engineering` from its discipline alternation) was applied alongside the union filter. The previous pattern matched any lecturer whose title contained "engineering"; under the broadened pool this would have surfaced mechanical, aerospace, and biomedical engineering lecturers from polytechnics and ITE as tech roles. On the same 11-Feb snapshot, the tightening preserves all seven genuine School-of-Computing / cyber / informatics lecturer matches while excluding eighteen false positives.

## Consequences

- `ROLE_TAGS` is now load-bearing in two places: feature selection on the `'job title'` branch (ADR-0001) and visibility of non-IT-industry listings on **both** branches. A missing tag silently excludes such listings from both paths.
- The 11-Feb snapshot showed the union adds ~71 listings (+16%) to the pool without dropping anything.
- Agencies whose IT roles were previously invisible (HDB, MAS, HTX, MINDEF, MilSec, EDB) become eligible for the `'agency'` feature.
- If a different vertical is ever needed, change `IT_INDUSTRY` or extend `ROLE_TAGS` — the filter shape itself is generic.
