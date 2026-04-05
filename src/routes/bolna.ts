import { Router } from 'express'
import ComposioClient from '@composio/client'
import { requireBolnaAuth } from '../middleware/bolna-auth.js'
import { createAdminClient } from '../lib/supabase.js'
import { readProfile } from '../services/profile-storage.js'
import { dispatchProfileTool } from './profile.js'

const router = Router()
const composioClient = new ComposioClient({ apiKey: process.env.COMPOSIO_API_KEY! })

const PROFILE_TOOLS = new Set([
  'read_profile',
  'update_profile',
  'delete_profile_entry',
  'log_interaction',
  'list_templates',
  'get_template',
  'save_template',
  'delete_template',
  'save_conversation_note',
  'get_conversation_log',
  'list_conversation_history',
  'search_conversation_logs',
])

type ToolkitSlug = 'gmail' | 'outlook'

const EMAIL_TOOL_MAP: Record<string, Record<ToolkitSlug, string>> = {
  check_inbox:    { gmail: 'GMAIL_FETCH_EMAILS',               outlook: 'OUTLOOK_OUTLOOK_LIST_MESSAGES' },
  read_email:     { gmail: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', outlook: 'OUTLOOK_OUTLOOK_GET_MESSAGE' },
  search_emails:  { gmail: 'GMAIL_FETCH_EMAILS',               outlook: 'OUTLOOK_OUTLOOK_SEARCH_MESSAGES' },
  send_email:     { gmail: 'GMAIL_SEND_EMAIL',                 outlook: 'OUTLOOK_OUTLOOK_SEND_EMAIL' },
  reply_to_email: { gmail: 'GMAIL_REPLY_TO_THREAD',            outlook: 'OUTLOOK_OUTLOOK_REPLY_EMAIL' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface UserLookup {
  userId: string
  provider: string
}

async function resolveUserByPhone(phoneNumber: string): Promise<UserLookup | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_metadata')
    .select('user_id, provider')
    .eq('phone_number', phoneNumber)
    .single()

  if (error || !data) return null
  return { userId: data.user_id, provider: data.provider }
}

function toolkitForProvider(provider: string): ToolkitSlug {
  return provider === 'google' ? 'gmail' : 'outlook'
}

// ─── Inbound caller lookup ────────────────────────────────────────────────────
//
// Bolna calls this when an inbound call arrives. It passes the caller's phone
// number and expects user data to inject into the agent's system prompt.

router.get('/bolna/inbound-lookup', requireBolnaAuth, async (req, res) => {
  const contactNumber = req.query.contact_number as string | undefined

  if (!contactNumber) {
    res.status(400).json({ error: 'Missing contact_number query parameter' })
    return
  }

  try {
    const user = await resolveUserByPhone(contactNumber)

    if (!user) {
      res.json({
        user_name: 'Unknown',
        user_id: '',
        profile_content:
          'The caller is not registered. Politely ask them to sign up at the Mantri website and register their phone number before calling back.',
      })
      return
    }

    const profileContent = await readProfile(user.userId)

    const supabase = createAdminClient()
    const { data: authUser } = await supabase.auth.admin.getUserById(user.userId)
    const userName =
      authUser?.user?.user_metadata?.full_name ??
      authUser?.user?.user_metadata?.name ??
      authUser?.user?.email ??
      'User'

    res.json({
      user_name: userName,
      user_id: user.userId,
      profile_content: profileContent,
    })
  } catch (error) {
    console.error('[bolna/inbound-lookup]', error)
    res.json({
      user_name: 'Unknown',
      profile_content: 'Failed to load user profile. Apologize and ask the caller to try again later.',
    })
  }
})

// ─── Tool bridge ──────────────────────────────────────────────────────────────
//
// Bolna custom functions call this during live conversations. The LLM extracts
// parameters and Bolna POSTs them here. `from_number` is auto-injected by Bolna.

router.post('/bolna/tools/:toolName', requireBolnaAuth, async (req, res) => {
  const toolName = String(req.params.toolName)
  const params = req.body as Record<string, unknown>
  const fromNumber = params.from_number as string | undefined

  if (!fromNumber) {
    res.status(400).json({ error: 'Missing from_number parameter' })
    return
  }

  try {
    const user = await resolveUserByPhone(fromNumber)

    if (!user) {
      res.json({ result: 'Could not identify the caller. Please ask them to register their phone number.' })
      return
    }

    // Profile / memory tools
    if (PROFILE_TOOLS.has(toolName)) {
      const { from_number: _, ...toolParams } = params
      const result = await dispatchProfileTool(user.userId, toolName, toolParams)
      res.json({ result })
      return
    }

    // Email tools
    const emailMapping = EMAIL_TOOL_MAP[toolName]
    if (emailMapping) {
      const toolkit = toolkitForProvider(user.provider)
      const composioSlug = emailMapping[toolkit]

      const { from_number: _, ...toolArgs } = params
      const args = Object.fromEntries(
        Object.entries(toolArgs).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      )

      const result = await composioClient.tools.execute(composioSlug, {
        user_id: user.userId,
        arguments: args,
      })

      const responseText =
        typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2)

      res.json({ result: responseText })
      return
    }

    res.status(404).json({ error: `Unknown tool: ${toolName}` })
  } catch (error) {
    console.error(`[bolna/tools/${toolName}]`, error)
    const message = error instanceof Error ? error.message : 'Tool execution failed'
    res.json({ result: `Error: ${message}` })
  }
})

export default router
