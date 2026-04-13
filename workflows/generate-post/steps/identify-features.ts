import { generateText, Output } from 'ai'
import { z } from 'zod'
import { model } from '../../shared'

const JOB_PORTAL_URL_PREFIX = 'https://jobs.careers.gov.sg/jobs/hrp'

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
      body: JSON.stringify([{ key, value: Date.now().toString(), expiration_ttl: 3 * 30 * 24 * 60 * 60 }]), // expire in 90 days
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
      trend: 'No jobs available',
      jobCsv: '',
    }
  }

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

  const kv = new SimpleCloudflareKV({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  })

  const namespace = featureType === 'job title' ? process.env.CF_TITLES_KV! : process.env.CF_AGENCIES_KV!

  const pastEntries = await kv.listKeys(namespace)

  const { output } = await generateText({
    model,
    system: 
      'You work for the Singapore Public Service, focusing on trends in hiring for information technology roles. ' +
      'You are methodical and detail-oriented, and do not make assumptions beyond the data that is presented to you.',
    prompt: `Identify the singlemost significant ${featureType} in the following job metadata.\n
    ${pastEntries.length === 0 ? '' : `Absolutely avoid the following past ${featureType}s: ${pastEntries.join(', ')}\n`}
    The CSV of job metadata to be featured is found below:\n${jobMetadata}\n
    `,
    output: Output.object({
      schema: z.object({
        feature: z.string().describe(`The identified ${featureType}`),
        jobs: z.array(z.object({ 
          jobId: z.string().describe('The job ID of the role'), 
          postingNo: z.string().describe('The posting number of the role')
        })).describe(`A list of jobs that fit the identified ${featureType}`),
      })
    })
  })

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
      .map(job => ({...job, url: `${JOB_PORTAL_URL_PREFIX}/${job.jobId}/${job.postingNo}`} as Record<string, string>))
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