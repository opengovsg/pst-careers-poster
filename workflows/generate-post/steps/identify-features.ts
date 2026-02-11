import { generateText, Output } from 'ai'
import { z } from 'zod'
import { model } from '../../shared'

const JOB_PORTAL_URL_PREFIX = 'https://jobs.careers.gov.sg/jobs/hrp'

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
        job.experienceYearsMax
      ]
      .join(',')
    )
  ].join('\n')

  const { output } = await generateText({
    model,
    system: 
      'You work for the Singapore Public Service, focusing on trends in hiring for information technology roles. ' +
      'You are methodical and detail-oriented, and do not make assumptions beyond the data that is presented to you.',
    prompt: `Identify the singlemost significant ${featureType} in the following job metadata.
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

  const jobCsv = [
    [...Object.keys(jobs[0]),'url'].join(','),
    jobs
      .filter(job => 
        output.jobs.some(
          ({ jobId, postingNo }) => 
            jobId === job.jobId && 
            postingNo === job.postingNo
        )
      )
      .map(job => ({...job, url: `${JOB_PORTAL_URL_PREFIX}/${job.jobId}/${job.postingNo}`}))
      .map(job => Object.values(job).map(value => `"${`${value}`.replace(/"/g, '""')}"`).join(','))
  ].join('\n')
  

  return {
    feature: output.feature,
    jobCsv,
  }
}