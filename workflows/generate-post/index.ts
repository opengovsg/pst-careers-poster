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

export async function generatePost(featureType: 'job title' | 'agency') {
  'use workflow'
  const jobs = await getJobs()
  return makeFeaturedPost(jobs, featureType)
}