import { generateContent, getJobs, makePost, identifyFeatures } from './steps'

export async function generatePost() {
  'use workflow' 
  const jobs = await getJobs()
  const { trend, jobCsv } = await identifyFeatures(jobs)
  if (jobCsv === '') {
    return { post: null, content: trend }
  } else {
    const content = await generateContent(trend, jobCsv)
    const post = await makePost(content)
    return { post, content }
  }
}