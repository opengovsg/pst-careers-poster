import { randomUUID } from 'crypto'

/**
 * Converts a standard UUID string to a Base62 encoded string.
 * @param {string} uuidStr - The UUID (e.g., "6b36714c-1c58-4e4b-9721-0b366228399d")
 * @returns {string} - The Base62 ID (e.g., "3GJ3fzM0uiWmfh51132W1V")
 */
function uuidToBase62(uuidStr: string): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

  const hex = uuidStr.replace(/-/g, "")
  let num = BigInt(`0x${hex}`)

  if (Number(num) === 0) {
    return alphabet[0]
  }

  let result = ""
  const base = BigInt(alphabet.length)

  while (Number(num) > 0) {
    result += alphabet[Number(num % base)]
    num = num / base
  }

  return result
}

/**
 * Post the social media content
 * @param value the post content
 */
export async function makePost(value: string) {
  'use step'

  const submissionId = randomUUID()
  const sessionToken = uuidToBase62(randomUUID())
  const baseUrl = `https://api.fillout.com/v1/flow/${process.env.FILLOUT_FORM_ID}`

  const init = await fetch(`${baseUrl}/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionToken,
      isEditingSubmission: false,
      domain: 'forms.fillout.com',
      flowOwnerUserId: process.env.FILLOUT_FLOW_OWNER_USER_ID,
      mode: 'live',
      organizationId: process.env.FILLOUT_ORGANIZATION_ID,
      uniqueVisitor: true,
    }),
  })
  if (!init.ok) {
    throw new Error(`Failed to initialize session: ${init.statusText}`)
  }

  const response = await fetch(`${baseUrl}/continue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: 'live',
      sessionToken,
      stepId: process.env.FILLOUT_STEP_ID,
      model: {
        urlParams: {},
        stepHistory: {
          path: [process.env.FILLOUT_STEP_ID],
        },
        calculations: {},
        globals: {
          submissionId,
        },
        quiz: {},
        aH81: {},
        [process.env.FILLOUT_STEP_ID]: {
          [process.env.FILLOUT_CONTENT_ID]: {
            value,
          },
        },
      },
      version: 'v2',
      updateSequenceNumber: 1,
      metadata: {
        timeToCompleteInSeconds: Number(Math.random().toFixed(5)) * 200,
        timezone: 'Asia/Singapore',
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to submit content: ${response.statusText}`)
  }
  return response.json()
}