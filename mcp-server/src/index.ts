import 'dotenv/config'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { supabaseAnon } from './lib/supabase.js'
import { registerProfileTools } from './tools/profile.js'
import { registerTemplateTools } from './tools/templates.js'
import { registerMemoryTools } from './tools/memory.js'

// ─── Session registry ─────────────────────────────────────────────────────────
// Keeps transports alive between initialize and subsequent tool calls.

interface Session {
  transport: StreamableHTTPServerTransport
  userId: string
}

const sessions = new Map<string, Session>()

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function validateToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const {
    data: { user },
    error,
  } = await supabaseAnon.auth.getUser(token)
  if (error || !user) return null
  return user.id
}

function isInitializeRequest(body: unknown): boolean {
  if (typeof body !== 'object' || !body) return false
  const b = body as Record<string, unknown>
  return b.method === 'initialize'
}

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'mantri-profile-mcp', tools: 12 })
})

// POST /mcp — handles initialize and all tool calls
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined

  // Route to an existing session
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!
    await session.transport.handleRequest(req, res, req.body)
    return
  }

  // Only allow new sessions on initialize
  if (!isInitializeRequest(req.body)) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'No active session. Send an initialize request first.' },
      id: null,
    })
    return
  }

  // Validate auth on session creation
  const userId = await validateToken(req.headers.authorization)
  if (!userId) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: provide a valid Supabase Bearer token.' },
      id: null,
    })
    return
  }

  // Build a new server scoped to this user
  const server = new McpServer({
    name: 'mantri-profile',
    version: '1.0.0',
  })
  registerProfileTools(server, userId)
  registerTemplateTools(server, userId)
  registerMemoryTools(server, userId)

  let newSessionId: string = randomUUID()

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => {
      newSessionId = randomUUID()
      return newSessionId
    },
    onsessioninitialized: (sid) => {
      sessions.set(sid, { transport, userId })
    },
  })

  transport.onclose = () => {
    sessions.delete(newSessionId)
  }

  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// GET /mcp — SSE stream for an existing session
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId)!.transport.handleRequest(req, res)
    return
  }
  res.status(400).json({ error: 'Invalid or missing session ID' })
})

// DELETE /mcp — terminate a session
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!
    await session.transport.handleRequest(req, res)
    sessions.delete(sessionId)
    return
  }
  res.status(404).json({ error: 'Session not found' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3002

app.listen(PORT, () => {
  console.log(`Mantri Profile MCP server running on http://localhost:${PORT}`)
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`)
  console.log(`Health check: http://localhost:${PORT}/health`)
  console.log()
  console.log('Claude Desktop config:')
  console.log(
    JSON.stringify(
      {
        mcpServers: {
          mantri: {
            url: `http://localhost:${PORT}/mcp`,
            headers: { Authorization: 'Bearer <your-supabase-token>' },
          },
        },
      },
      null,
      2
    )
  )
})
