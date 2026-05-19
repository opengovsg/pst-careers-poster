import { createAiGateway } from 'ai-gateway-provider';
import { createUnified } from 'ai-gateway-provider/providers/unified';

export const provider = createAiGateway({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  gateway: 'default',
  apiKey: process.env.CLOUDFLARE_API_TOKEN!,
})

const unified = createUnified()

export const model = provider(unified(process.env.CF_AI_MODEL_NAME!))
