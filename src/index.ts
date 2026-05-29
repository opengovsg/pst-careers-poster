import './instrumentation.ts'

import express from 'express'
import { start } from 'workflow/api'
import { generatePost } from '../workflows/generate-post'
const app = express()
app.use(express.json())
app.get('/api/generate', async (req, res) => {
  
  const authToken = req.headers.authorization
  if (authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const feature = req.query.feature
  if (feature !== 'job title' && feature !== 'agency' && feature !== 'trend') {
    return res.status(400).json({ error: 'Invalid feature type' })
  }

  await start(generatePost, [feature])
  return res.json({ message: 'generate workflow started' })
})
export default app