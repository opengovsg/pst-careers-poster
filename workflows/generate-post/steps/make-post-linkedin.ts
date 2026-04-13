
/**
 * Post the social media content
 * @param content the post content
 */
export async function makePost(commentary: string) {
  'use step'
  const response = await fetch(`${process.env.LINKEDIN_API_URL}/rest/posts`, {
    method: 'POST',
    body: JSON.stringify({
      author: process.env.LINKEDIN_AUTHOR_URN,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: Boolean(process.env.DRY_RUN) ? 'NONE' : 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false
    }),
    headers: { 
      'Content-Type': 'application/json',
      'Linkedin-Version': '202601',
      'X-Restli-Protocol-Version': '2.0.0',
      'Authorization': `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
    },
  })
  return response.json()
}