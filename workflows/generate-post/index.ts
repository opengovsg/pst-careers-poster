import { generateContent, getJobs, makePost, identifyFeatures } from './steps'

async function makeFeaturedPost(jobs: Record<string, string>[], featureType: 'job title' | 'agency') {
  const { feature, jobCsv } = await identifyFeatures(jobs, featureType)
  if (jobCsv === '') {
    return { post: null, content: feature }
  } else {
    const content = await generateContent(feature, jobCsv)
    const post = await makePost(content)
    return { post, content }
  }
}

export async function generatePost() {
  'use workflow' 
  const jobs = await getJobs()
  const [jobTitle, agency] = await Promise.all([
    makeFeaturedPost(jobs, 'job title'),
    makeFeaturedPost(jobs, 'agency'),
  ])
  return { jobTitle, agency }
}