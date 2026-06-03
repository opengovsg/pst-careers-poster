import { generateText, Output } from 'ai'
import { z } from 'zod'
import { model } from '../../../shared'
import { ROLE_TAGS, matchesRoleTag, stripHtml } from './role-tags'

const JOB_PORTAL_URL_PREFIX = 'https://jobs.careers.gov.sg/jobs'
const IT_INDUSTRY = 'InfoComm, Technology, New Media Communications'
// Trend mode: jobRequirements is the richest per-row signal we have but is
// dominated by agency boilerplate after the first sentence or two. 200 chars
// keeps the role-specific lead while bounding total prompt size to ~70K tokens
// on a ~750-row filtered set.
const REQ_SNIPPET_CHARS = 200

class SimpleCloudflareKV {
  private accountId: string
  private token: string
  constructor({ accountId, token }: { accountId: string, token: string }) {
    this.accountId = accountId
    this.token = token
  }
  async listKeys(namespace: string): Promise<string[]> {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${namespace}/keys`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to list keys: ${response.statusText}`)
    }
    const data = await response.json()
    return data.result.map((item: { name: string }) => item.name)
  }
  async addKey(namespace: string, key: string): Promise<void> {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${namespace}/bulk`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ key, value: Date.now().toString(), expiration_ttl: 45 * 24 * 60 * 60 }]), // expire in 45 days
    })
    if (!response.ok) {
      throw new Error(`Failed to add key: ${response.statusText}`)
    }
  }

}



export async function identifyFeatures(jobs: Record<string, string>[], featureType: 'job title' | 'agency' | 'trend') {
  'use step'

  if (jobs.length === 0) {
    return {
      feature: 'No jobs available',
      listings: [],
    }
  }

  // Trend mode skips dedup: trend strings are 1-2 sentence narratives, and
  // fuzzy-string collisions across weeks would be confusing to gate on. Per
  // design, accept week-to-week story variance instead of persisting state.
  const useKv = featureType !== 'trend'
  const kv = useKv
    ? new SimpleCloudflareKV({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        token: process.env.CLOUDFLARE_API_TOKEN!,
      })
    : null

  const namespace = featureType === 'job title' ? process.env.CF_TITLES_KV
    : featureType === 'agency' ? process.env.CF_AGENCIES_KV
    : null

  const pastEntries = kv && namespace ? await kv.listKeys(namespace) : []

  const { output } = await findFeature(featureType, pastEntries, jobs)

  console.log(output)

  if (!output.feature) {
    return {
      feature: 'No jobs available',
      listings: [],
    }
  }

  if (kv && namespace) {
    await kv.addKey(namespace, output.feature)
  }

  return {
    feature: output.feature,
    listings: jobs
      .filter(job => 
        output.listings.some(
          ({ jobId, postingNo }) => 
            jobId === job.jobId && 
            postingNo === job.postingNo
        )
      )
      .map(job => ({...job, url: `${JOB_PORTAL_URL_PREFIX}/${job.platform}/${job.postingNo ? `${job.jobId}/${job.postingNo}` : job.jobId}?utm_source=pst-careers&utm_medium=linkedin&utm_campaign=post`} as Record<string, string>)),
  }
}

type FeatureOutput = {
  output: {
    feature: string | undefined
    listings: { jobId: string, postingNo: string }[]
  }
}

async function findFeature(featureType: 'job title' | 'agency' | 'trend', pastEntries: string[], jobs: Record<string, string>[]): Promise<FeatureOutput> {
  // A listing counts as a "tech role" if its industry is IT, OR it matches any
  // ROLE_TAG. The role-tag leg catches IT-shaped roles that agencies file under
  // their org's primary industry (e.g. HDB software engineers under Engineering,
  // MAS data analysts under Accounting, MilSec infosec under Enforcement).
  const itJobs = jobs.filter(job =>
    job.industry === IT_INDUSTRY ||
    ROLE_TAGS.some(tag => matchesRoleTag(job, tag)),
  )

  switch (featureType) {
    case 'agency': {
      // Statistical mode of the agency, excluding agencies featured in the
      // past `pastEntries` window (45-day TTL in Cloudflare KV).
      const jobsByAgency = itJobs.reduce((acc, job) => {
        if (pastEntries.includes(job.agency)) return acc
        if (!acc[job.agency]) acc[job.agency] = []
        acc[job.agency].push({ jobId: job.jobId, postingNo: job.postingNo })
        return acc
      }, {} as Record<string, { jobId: string, postingNo: string }[]>)

      const [topAgency] = Object.entries(jobsByAgency).sort((a, b) => b[1].length - a[1].length)
      if (!topAgency) {
        return { output: { feature: undefined, listings: [] } }
      }
      const [feature, agencyJobs] = topAgency
      return { output: { feature, listings: agencyJobs } }
    }

    case 'job title': {
      // Match each listing against the canonical ROLE_TAGS vocabulary. A
      // listing qualifies for a tag if the title matches, OR the requirements
      // field has REQ_HIT_THRESHOLD+ keyword hits (single hits are usually
      // incidental — see the const). Job description is intentionally not
      // scanned: it's dominated by agency boilerplate that mentions every
      // keyword. Take the mode tag, excluding tags featured in the recent
      // window. Ties broken by latest startDate so fresh hiring activity wins.
      const tagMatches = ROLE_TAGS
        .filter(tag => !pastEntries.includes(tag.name))
        .map(tag => {
          const matched = itJobs.filter(job => matchesRoleTag(job, tag))
          const latestStartDate = matched.reduce(
            (max, job) => Math.max(max, Number(job.startDate) || 0),
            0,
          )
          return {
            name: tag.name,
            count: matched.length,
            latestStartDate,
            listings: matched.map(job => ({ jobId: job.jobId, postingNo: job.postingNo })),
          }
        })
        .filter(tag => tag.count > 0)
        .sort((a, b) => b.count - a.count || b.latestStartDate - a.latestStartDate)

      const top = tagMatches[0]
      if (!top) {
        return { output: { feature: undefined, listings: [] } }
      }
      return { output: { feature: top.name, listings: top.listings } }
    }

    case 'trend': {
      // Open-ended trend identification. The CSV carries the richest per-row
      // signal we can fit: title, agency, functional area, field, and a
      // jobRequirements snippet (HTML-stripped, truncated). The prompt
      // explicitly steers away from mode-of-title and mode-of-agency framings
      // (those are the other two cases above) and rejects single-agency
      // rosters that masquerade as sub-stories.
      //
      // Selection uses the integer row-ID frame from ADR-0003: each row gets a
      // 1..N id and the model returns ids, never the opaque postingNo UUIDs.
      // The runner maps ids back to canonical {jobId, postingNo}. This avoids
      // the two failure modes a nested {jobId, postingNo}[] schema triggered on
      // small models — collapsing the CSV's "jobId,postingNo" pair into a flat
      // string, and truncating/transposing the UUID while reproducing it.
      const csvField = (v: unknown) => {
        const s = String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')
        return /[,"]/.test(s) ? `"${s}"` : s
      }
      const idToRow = new Map<number, Record<string, string>>()
      itJobs.forEach((job, i) => idToRow.set(i + 1, job))
      const jobMetadata = [
        'id,jobTitle,agency,functionalArea,field,jobRequirementsSnippet',
        ...itJobs.map((job, i) => [
          i + 1,
          job.jobTitle,
          job.agency,
          job.functionalArea,
          job.field,
          stripHtml(job.jobRequirements).slice(0, REQ_SNIPPET_CHARS),
        ].map(csvField).join(',')),
      ].join('\n')
      const { output } = await generateText({
        model,
        system: 'You are a hiring trends analyst for the Singapore Public Service. ' +
          'You identify cross-cutting themes in public-sector IT hiring — patterns that span multiple agencies, ' +
          'capability buildouts that cut across job titles, or structural sub-stories within a single agency. ' +
          'You ground every claim in the data and never invent details.',
        prompt: `Read the following CSV of currently-open Singapore public-sector IT job listings. The leading "id" column is the integer you will return.

Identify ONE significant hiring trend. Do NOT report "the most common job title" or "the most active agency" — those are covered by separate deterministic analyses and would be redundant here. Look instead for cross-cutting narratives, for example:

- Multiple agencies simultaneously standing up the same capability (e.g. three agencies all building red-team functions)
- A capability buildout that spans different job titles under one banner (e.g. an LLM-tooling buildout pulling in engineers, researchers, and data scientists across agencies)
- A sub-story within a single agency that reveals an internal structural pattern — but ONLY if the sub-story has its own verticals (e.g. one agency expanding vulnerability research across web, mobile, and cloud surfaces). A single-agency story is NOT a trend if it merely enumerates that agency's hiring across seniority levels or job families (e.g. "Agency X is hiring across engineering, leadership, and product" is a roster, not a trend).

Strongly prefer trends that span at least 2 distinct agencies. Reach for a single-agency framing only if no cross-agency pattern is defensible, and only if you can name 2+ concrete sub-domains within that agency.

For the "feature" field, output 1-2 sentences that name the trend AND explain why the chosen roles fit together — combine the headline and rationale into a single string. For the "ids" field, pick 4-12 listings that actually fit the trend and return the integer from their "id" column — nothing else.

CSV:
${jobMetadata}
`,
        output: Output.object({
          schema: z.object({
            feature: z.string().describe('The identified trend, as a 1-2 sentence narrative carrying both headline and rationale'),
            ids: z.array(z.number()).describe('The integer ids (from the "id" column) of the listings that fit the identified trend (4-12 entries)'),
          }),
        }),
      })

      // Map ids back to canonical {jobId, postingNo}, dropping out-of-range ids
      // and deduping repeats — the same backstops the ranking call applies.
      const seen = new Set<number>()
      const listings: { jobId: string, postingNo: string }[] = []
      for (const id of output.ids ?? []) {
        const row = idToRow.get(id)
        if (!row || seen.has(id)) continue
        seen.add(id)
        listings.push({ jobId: row.jobId, postingNo: row.postingNo })
      }
      return { output: { feature: output.feature, listings } }
    }
  }
}
