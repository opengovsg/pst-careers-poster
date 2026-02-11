import { createOpenAI } from '@ai-sdk/openai'

export const provider = createOpenAI({
  name: 'engine',
  baseURL: process.env.OPENAI_ENDPOINT!,
  apiKey: process.env.OPENAI_API_KEY!,
})

export const model = provider('claude-sonnet-4-5-20250929-v1:rsn')
