import { generateContent, getJobs, makePost } from './steps'

export async function generatePost() {
  'use workflow' 
  const jobs = await getJobs()
  const content = await generateContent(jobs)
  const post = await makePost(content)
  
  return { post, content }
}