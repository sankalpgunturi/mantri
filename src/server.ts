import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import profileRoutes from './routes/profile.js'
import emailRoutes from './routes/email.js'
import devRoutes from './routes/dev.js'
import bolnaRoutes from './routes/bolna.js'
import userRoutes from './routes/user.js'

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
app.use('/api', devRoutes)
app.use('/api', bolnaRoutes)
app.use('/api', userRoutes)

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
