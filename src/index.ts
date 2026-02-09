import express from 'express'
import { start } from 'workflow/api'
import { generatePost } from '../workflows/generate-post'
const app = express()
app.use(express.json())
app.post('/api/generate', async (req, res) => {
  
  const authToken = req.headers.authorization
  if (authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  await start(generatePost)
  return res.json({ message: 'generate workflow started' })
})
export default app