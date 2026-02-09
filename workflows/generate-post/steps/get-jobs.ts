

export async function getJobs() {
  'use step'
  const response = await fetch(process.env.JOB_LISTINGS_CSV_URL as string)
  return response.text()
}