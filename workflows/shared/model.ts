import { createOpenAI } from '@ai-sdk/openai'
import { observeOpenAI } from '@langfuse/openai'

const isLangfuseActive =  process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY

const addInstrumentation: typeof observeOpenAI = isLangfuseActive 
  ? observeOpenAI
  : (provider) => provider

export const provider = addInstrumentation(createOpenAI({
  name: 'engine',
  baseURL: process.env.OPENAI_ENDPOINT!,
  apiKey: process.env.OPENAI_API_KEY!,
}))

export const model = provider('claude-sonnet-4-5-20250929-v1:rsn')
