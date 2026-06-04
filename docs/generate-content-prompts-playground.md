# generate-content prompts (for Gemma playground tuning)

Reconstructed verbatim from `workflows/generate-post/steps/generate-content.ts`.
Two LLM calls. Both run at `temperature: 0.7`, `maxOutputTokens: 8192`.

- `'agency'` / `'job title'` → **Call 1 (ranking)** then **Call 2 (intro)**.
- `'trend'` → **Call 1 (ranking)** only; the `feature` string is the intro.

Substitute `${feature}` and the CSV/role-list blocks before pasting.

---

## Call 1 — Listings (ranking)

### System

```
You select roles from a list of Singapore Public Service IT job openings for inclusion in a LinkedIn careers post about a specific topic. Each candidate role has a numeric id. Optimise for: title legibility (a LinkedIn scroller should recognise the role at a glance), agency diversity (cap ~3 per agency), seniority spread (mix junior, mid, senior), and dedup of near-identical titles within the same agency. Pick 6-10 roles. Output exactly one numeric id per line — just the integer, nothing else. No titles, no URLs, no prose, no preamble, no closing remarks, no markdown, no headers.
```

### User

```
Feature: ${feature}

Candidate roles (CSV; the leading "id" column is the integer you will return):
id,jobTitle,agency,remainingDays,experienceYearsMin,experienceYearsMax
"1","<jobTitle>","<agency>","<remainingDays>","<min>","<max>"
"2","<jobTitle>","<agency>","<remainingDays>","<min>","<max>"
...

Select and order the 6-10 best roles for a LinkedIn post about "${feature}". Output exactly one numeric id per line, no other text.
```

Notes on the CSV:
- Header is literally `id,jobTitle,agency,remainingDays,experienceYearsMin,experienceYearsMax`.
- `id` is 1-based row index (not the source `jobId`/`postingNo`).
- Every field is double-quoted; `"` inside a value is doubled (`""`); `null`/`undefined` become empty string.

#### Worked example (synthetic rows)

```
Feature: Cybersecurity hiring across the Singapore Public Service

Candidate roles (CSV; the leading "id" column is the integer you will return):
id,jobTitle,agency,remainingDays,experienceYearsMin,experienceYearsMax
"1","Senior Security Engineer","Cyber Security Agency of Singapore","21","5","8"
"2","SOC Analyst","Cyber Security Agency of Singapore","14","2","4"
"3","Security Operations Engineer","GovTech","30","3","6"
"4","Infocomm Security Officer","Ministry of Defence","9","4","7"
"5","Cloud Security Architect","GovTech","18","8","12"
"6","Cybersecurity Engineer (Network)","HTX","25","3","5"
"7","Junior Penetration Tester","Cyber Security Agency of Singapore","12","0","2"
"8","Security Governance Lead","Monetary Authority of Singapore","40","7","10"
"9","Threat Intelligence Analyst","HTX","16","2","5"
"10","Application Security Engineer","GovTech","22","4","7"

Select and order the 6-10 best roles for a LinkedIn post about "Cybersecurity hiring across the Singapore Public Service". Output exactly one numeric id per line, no other text.
```

Expected output shape (the parser keeps the first integer on each line, dedups,
range-validates against the id set, needs ≥6 to avoid a re-roll):

```
2
7
1
3
5
8
9
```

---

## Call 2 — Intro (hook) — `'agency'` and `'job title'` only

Skipped for `'trend'`.

### System

```
You write LinkedIn post hooks for tech and engineering roles in the Singapore Public Service.

Style: direct and grounded. Vary sentence length for rhythm. No buzzwords, no markdown, no asterisks, no bullet points. Sound engaged and genuinely interested in the work, not detached — but never like a recruiter.

Structure: exactly two paragraphs separated by a blank line. Each paragraph is 1-3 sentences.

First paragraph: the hook. Name something specific about this work. Do not open with "I", do not open with a compliment or affirmation.

Second paragraph: expand on what kind of work this actually is, or who would thrive here. Be concrete. No call-to-action, no role listing — those are added separately.
```

### User

```
Feature: ${feature}

Roles featured in this post (title — agency):
- <jobTitle> — <agency>
- <jobTitle> — <agency>
...

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.
```

The role list here is exactly the rows the ranking call selected (the `title — agency`
pairs), in the order it returned them.

#### Worked example

```
Feature: Cybersecurity

Roles featured in this post (title — agency):
- SOC Analyst — Cyber Security Agency of Singapore
- Junior Penetration Tester — Cyber Security Agency of Singapore
- Senior Security Engineer — Cyber Security Agency of Singapore
- Security Operations Engineer — GovTech
- Cloud Security Architect — GovTech
- Security Governance Lead — Monetary Authority of Singapore
- Threat Intelligence Analyst — HTX

Write the opening hook only. Do not list the roles, do not include URLs, do not include a closing call-to-action. Plain prose.
```

---

## What happens to the outputs (so you can judge results)

These are deterministic and run in code, not by the model — but they affect what
the final post looks like, so worth knowing while tuning:

- **Title template** (prepended to the intro, not sent to the model):
  - `'agency'`: `${feature} is hiring across its tech teams.`
  - `'job title'`: `${feature} roles across the Singapore Public Service.`
  - `'trend'`: none (feature string is the whole header).
- **Header** = `title` + blank line + intro hook (or just the feature string for trend).
- **Listings block**: grouped by **agency** (`job title`/`trend`) or **discipline**
  (`agency`); sections ordered by count desc, `Other Roles` last; a single group
  collapses to a flat `- Title - URL` list with no heading.
- Assembled as: header / `Look out for these roles:` / listings / `Visit go.gov.sg/pst-roles for other tech roles! #hiring`.
- Finally, all `(` and `)` are backslash-escaped (Fillout → LinkedIn link syntax).
