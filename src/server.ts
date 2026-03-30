import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import profileRoutes from './routes/profile.js'
import emailRoutes from './routes/email.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[]

app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api', profileRoutes)
app.use('/api', emailRoutes)

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
