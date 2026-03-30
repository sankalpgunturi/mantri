import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { composio, emailToolkitForProvider, type EmailToolkit } from '../services/composio.js'

const router = Router()

/**
 * POST /api/email/connect
 * Body: { provider: "google" | "azure" }
 *
 * Creates a Composio session for this Supabase user and returns a Composio
 * Connect Link URL. The frontend redirects the user there to grant OAuth consent.
 * After consent, Composio redirects back to the callbackUrl.
 */
router.post('/email/connect', requireAuth, async (req, res) => {
  try {
    const { provider } = req.body as { provider: string }
    if (!provider) {
      res.status(400).json({ error: 'Missing provider in request body' })
      return
    }

    const toolkit = emailToolkitForProvider(provider)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

    const session = await composio.create(req.user!.id, { manageConnections: false })
    const connectionRequest = await session.authorize(toolkit, {
      callbackUrl: `${frontendUrl}?email_connected=1`,
    })

    res.json({ redirectUrl: connectionRequest.redirectUrl, toolkit })
  } catch (error) {
    console.error('[email/connect]', error)
    res.status(500).json({ error: 'Failed to initiate email connection' })
  }
})

/**
 * GET /api/email/status
 * Query: ?provider=google|azure
 *
 * Checks whether the user's email toolkit (Gmail or Outlook) has an active
 * connected account in Composio.
 */
router.get('/email/status', requireAuth, async (req, res) => {
  try {
    const provider = req.query.provider as string | undefined
    const toolkitsToCheck: EmailToolkit[] = provider
      ? [emailToolkitForProvider(provider)]
      : ['gmail', 'outlook']

    const session = await composio.create(req.user!.id, { manageConnections: false })
    const toolkitsResult = await session.toolkits()

    const match = toolkitsResult.items.find(
      (t) => toolkitsToCheck.includes(t.slug as EmailToolkit) && t.connection?.connectedAccount
    )

    if (match) {
      res.json({
        connected: true,
        toolkit: match.slug,
        connectedAccountId: match.connection?.connectedAccount?.id,
      })
    } else {
      res.json({ connected: false })
    }
  } catch (error) {
    console.error('[email/status]', error)
    res.status(500).json({ error: 'Failed to check email connection status' })
  }
})

export default router
