import { generateContent, getJobs, makePost, identifyFeatures } from './steps'

async function makeFeaturedPost(jobs: Record<string, string>[], featureType: 'job title' | 'agency') {
  const { feature, jobs: featuredJobs } = await identifyFeatures(jobs, featureType)
  if (featuredJobs.length === 0) {
    return { post: null, content: feature }
  } else {
    const content = await generateContent(feature, featuredJobs, featureType)
    const post = await makePost(content)
    return { post, content }
  }
}

export async function generatePost(featureType: 'job title' | 'agency') {
  'use workflow'
  const jobs = await getJobs()
  return makeFeaturedPost(jobs, featureType)
}