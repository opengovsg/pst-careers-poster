# Architecture Decision Records

This directory records significant architectural decisions in this project. Each ADR is a short, append-only note describing a decision, its context, and its consequences. ADRs are not specs — they describe what was decided and why, not how the code currently works (the code is its own documentation).

## Format

We use the [Michael Nygard ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Each ADR has the following sections:

- **Status** — Proposed, Accepted, Deprecated, or Superseded by ADR-NNNN.
- **Context** — The forces at play. What problem motivated the decision?
- **Decision** — What did we choose?
- **Consequences** — What follows from this — including downsides and constraints it places on future work.

## Naming

Files are named `NNNN-kebab-case-title.md`, where `NNNN` is a 4-digit sequence assigned at creation time (not when the decision was originally made). Numbers are never reused, even when an ADR is superseded.

## Index

- [ADR-0001 — Controlled vocabulary for feature selection](0001-controlled-vocabulary-feature-selection.md)
- [ADR-0002 — Union industry + role-tag filter for tech-role classification](0002-union-industry-role-tag-filter.md)
- [ADR-0003 — Two-call architecture with row-ID frame in `generateContent`](0003-two-call-generate-content.md)
