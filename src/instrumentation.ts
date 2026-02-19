import { NodeSDK } from '@opentelemetry/sdk-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'
 
const sdk = new NodeSDK({
  spanProcessors: [new LangfuseSpanProcessor({ flushAt: 1, exportMode: 'immediate' })],
})
 
sdk.start()
