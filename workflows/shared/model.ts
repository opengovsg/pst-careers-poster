import { createOpenAI } from '@ai-sdk/openai'

export const provider = createOpenAI({
  name: 'engine',
  baseURL: process.env.OPENAI_ENDPOINT!,
  apiKey: process.env.OPENAI_API_KEY!,
})

export const model = provider(process.env.OPENAI_MODEL_NAME!)
