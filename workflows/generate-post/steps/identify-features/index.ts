import { generateText, Output } from 'ai'
import { z } from 'zod'
import { model } from '../../../shared'
import { ROLE_TAGS } from './role-tags'

const JOB_PORTAL_URL_PREFIX = 'https://jobs.careers.gov.sg/jobs'
const IT_INDUSTRY = 'InfoComm, Technology, New Media Communications'
// A listing qualifies for a role tag if its title matches, OR its requirements
// field contains at least this many keyword hits. A single hit in requirements
// is almost always incidental ("basic knowledge of cybersecurity" in a
// non-cyber role); the threshold rejects those while still catching roles
// where the tag is genuinely a focus area but the title is generic.
const REQ_HIT_THRESHOLD = 2

function stripHtml(text: string | undefined): string {
  return (text ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ')
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, pattern) => {
    const global = pattern.flags.includes('g')
      ? pattern
      : new RegExp(pattern.source, pattern.flags + 'g')
    return sum + (text.match(global)?.length ?? 0)
  }, 0)
}

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



export async function identifyFeatures(jobs: Record<string, string>[], featureType: 'job title' | 'agency') {
  'use step'

  if (jobs.length === 0) {
    return {
      feature: 'No jobs available',
      jobCsv: '',
    }
  }

  const kv = new SimpleCloudflareKV({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  })

  const namespace = featureType === 'job title' ? process.env.CF_TITLES_KV! : process.env.CF_AGENCIES_KV!

  const pastEntries = await kv.listKeys(namespace)

  const { output } = await findFeature(featureType, pastEntries, jobs)

  console.log(output)

  if (!output.feature) {
    return {
      feature: 'No jobs available',
      jobCsv: '',
    }
  }

  await kv.addKey(namespace, output.feature)

  const jobCsv = [
    'postingNo,jobId,jobTitle,agency,agencyDescription,closingDateText,remainingDays,experienceYearsMin,experienceYearsMax,url,jobDescription,jobRequirements',
    [...Object.keys(jobs[0]),'url'].join(','),
    jobs
      .filter(job => 
        output.jobs.some(
          ({ jobId, postingNo }) => 
            jobId === job.jobId && 
            postingNo === job.postingNo
        )
      )
      .map(job => ({...job, url: `${JOB_PORTAL_URL_PREFIX}/${job.platform}/${job.postingNo ? `${job.jobId}/${job.postingNo}` : job.jobId}?utm_source=pst-careers&utm_medium=linkedin&utm_campaign=post`} as Record<string, string>))
      .map(
        job => [
          job.postingNo,
          job.jobId,
          job.jobTitle,
          job.agency,
          job.agencyDescription,
          job.closingDateText,
          job.remainingDays,
          job.experienceYearsMin,
          job.experienceYearsMax,
          job.url,
          job.jobDescription,
          job.jobRequirements,
        ]
        .map(value => `"${`${value}`.replace(/"/g, '""')}"`)
        .join(',')
      )
  ].join('\n')
  

  return {
    feature: output.feature,
    jobCsv,
  }
}

type FeatureOutput = {
  output: {
    feature: string | undefined
    jobs: { jobId: string, postingNo: string }[]
  }
}

async function findFeature(featureType: 'job title' | 'agency', pastEntries: string[], jobs: Record<string, string>[]): Promise<FeatureOutput> {
  const itJobs = jobs.filter(job => job.industry === IT_INDUSTRY)

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
        return { output: { feature: undefined, jobs: [] } }
      }
      const [feature, agencyJobs] = topAgency
      return { output: { feature, jobs: agencyJobs } }
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
          const matched = itJobs.filter(job => {
            if (tag.patterns.some(pattern => pattern.test(job.jobTitle))) return true
            const reqHits = countMatches(stripHtml(job.jobRequirements), tag.patterns)
            return reqHits >= REQ_HIT_THRESHOLD
          })
          const latestStartDate = matched.reduce(
            (max, job) => Math.max(max, Number(job.startDate) || 0),
            0,
          )
          return {
            name: tag.name,
            count: matched.length,
            latestStartDate,
            jobs: matched.map(job => ({ jobId: job.jobId, postingNo: job.postingNo })),
          }
        })
        .filter(tag => tag.count > 0)
        .sort((a, b) => b.count - a.count || b.latestStartDate - a.latestStartDate)

      const top = tagMatches[0]
      if (!top) {
        return { output: { feature: undefined, jobs: [] } }
      }
      return { output: { feature: top.name, jobs: top.jobs } }
    }

    default: {
      // Grab jobId, postingNo, jobTitle, agency, remainingDays,
      // experienceYearsMin, experienceYearsMax
      // send those to the model to identify trends and specific roles to highlight
      const jobMetadata = [
        'jobId,postingNo,jobTitle,agency,remainingDays,experienceYearsMin,experienceYearsMax',
        ...jobs
          .filter(job => ['InfoComm, Technology, New Media Communications'].includes(job.industry))
          .map(job => [
            job.jobId,
            job.postingNo,
            job.jobTitle,
            job.agency,
            job.remainingDays,
            job.experienceYearsMin,
            job.experienceYearsMax,
          ]
          .join(',')
        )
      ].join('\n')
      return await generateText({
        model,
        system: 'You work for the Singapore Public Service, focusing on trends in hiring for information technology roles. ' +
          'You are methodical and detail-oriented, and do not make assumptions beyond the data that is presented to you.',
        prompt: `Identify the most significant ${featureType ?? 'trend'} in the following job metadata.\n
        ${!featureType || pastEntries.length === 0 ? '' : `Absolutely avoid the following past ${featureType}s: ${pastEntries.join(', ')}\n`}
        The CSV of job metadata to be featured is found below:\n${jobMetadata}\n
        `,
        output: Output.object({
          schema: z.object({
            feature: z.string().describe(`The identified ${featureType ?? 'trend'}`),
            jobs: z.array(z.object({
              jobId: z.string().describe('The job ID of the role'),
              postingNo: z.string().describe('The posting number of the role'),
            })).describe(`A list of jobs that fit the identified ${featureType ?? 'trend'}`),
          })
        })
      })
    }
  }
}
