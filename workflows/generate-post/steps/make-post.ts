
/**
 * Post the social media content
 * @param value the post content
 */
export async function makePost(value: string) {
  'use step'
  const response = await fetch(`https://api.fillout.com/v1/api/forms/${process.env.FILLOUT_FORM_ID}/submissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.FILLOUT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      submissions: [
        {
          questions: [{ id: process.env.FILLOUT_CONTENT_ID, value }],
          urlParameters: [],
          scheduling: [],
          payments: [],
        }
      ],
    }),
  })
  return response.json()
}