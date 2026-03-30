import { Router } from 'express'
import ComposioClient from '@composio/client'
import { requireAuth } from '../middleware/auth.js'
import { emailToolkitForProvider } from '../services/composio.js'

const router = Router()

const client = new ComposioClient({ apiKey: process.env.COMPOSIO_API_KEY! })

/**
 * GET /api/dev/tools?provider=google|azure
 *
 * Lists available tools for the user's connected email toolkit.
 * Returns name, slug, description, and input schema for each tool.
 */
router.get('/dev/tools', requireAuth, async (req, res) => {
  try {
    const provider = (req.query.provider as string) ?? 'google'
    const toolkit = emailToolkitForProvider(provider)

    const result = await client.tools.list({
      toolkit_slug: toolkit,
      limit: 100,
    })

    const tools = result.items.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      inputSchema: t.input_parameters,
    }))

    res.json({ toolkit, tools })
  } catch (error) {
    console.error('[dev/tools]', error)
    res.status(500).json({ error: 'Failed to list tools' })
  }
})

/**
 * POST /api/dev/tools/run
 * Body: { toolSlug, inputs }  — inputs is stripped of blank values before forwarding
 *
 * Executes a Composio tool directly using the authenticated user's connected account.
 */
router.post('/dev/tools/run', requireAuth, async (req, res) => {
  try {
    const { toolSlug, inputs } = req.body as { toolSlug: string; inputs: Record<string, unknown> }

    if (!toolSlug) {
      res.status(400).json({ error: 'Missing toolSlug' })
      return
    }

    // Strip blank strings and nulls — Composio validation rejects empty optional fields
    const args = Object.fromEntries(
      Object.entries(inputs ?? {}).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    )

    const result = await client.tools.execute(toolSlug, {
      user_id: req.user!.id,
      arguments: args,
    })

    res.json(result)
  } catch (error: unknown) {
    console.error('[dev/tools/run]', error)
    // Surface the actual Composio error message back to the UI
    const composioMessage =
      (error as { error?: { error?: { message?: string } } })?.error?.error?.message ??
      (error instanceof Error ? error.message : 'Tool execution failed')
    res.status(500).json({ error: composioMessage })
  }
})

export default router
