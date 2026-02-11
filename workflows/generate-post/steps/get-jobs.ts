export async function getJobs() {
  'use step'
  const response = await fetch(process.env.JOB_LISTINGS_JSON_URL as string)
  return response.json()
}