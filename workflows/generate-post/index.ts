import { generateContent, getJobs, makePost, identifyFeatures } from './steps'

type FeatureType = 'job title' | 'agency' | 'trend'

async function makeFeaturedPost(jobs: Record<string, string>[], featureType: FeatureType) {
  const { feature, jobs: featuredJobs } = await identifyFeatures(jobs, featureType)
  if (featuredJobs.length === 0) {
    return { post: null, content: feature }
  } else {
    const content = await generateContent(feature, featuredJobs, featureType)
    const post = await makePost(content)
    return { post, content }
  }
}

export async function generatePost(featureType: FeatureType) {
  'use workflow'
  const jobs = await getJobs()
  return makeFeaturedPost(jobs, featureType)
}