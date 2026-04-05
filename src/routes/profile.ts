import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  initProfile,
  readProfile,
  updateProfile,
  listTemplates,
  readTemplate,
  writeTemplate,
  deleteTemplate,
  readLog,
  appendToLog,
  listLogDates,
  searchLogs,
} from '../services/profile-storage.js'
import { extractSection, replaceSection, deleteEntry } from '../utils/profile-utils.js'

const router = Router()

// ─── Onboarding ───────────────────────────────────────────────────────────────

router.post('/profile/init', requireAuth, async (req, res) => {
  try {
    await initProfile(req.user!.id, req.accessToken!)
    res.json({ success: true })
  } catch (error) {
    console.error('[profile/init]', error)
    res.status(500).json({ error: 'Failed to initialize profile' })
  }
})

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const content = await readProfile(req.user!.id)
    res.json({ content })
  } catch (error) {
    console.error('[profile/get]', error)
    res.status(500).json({ error: 'Failed to read profile' })
  }
})

router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { content } = req.body as { content?: string }
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Missing content field' })
      return
    }
    await updateProfile(req.user!.id, content)
    res.json({ success: true })
  } catch (error) {
    console.error('[profile/put]', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// ─── Template routes ──────────────────────────────────────────────────────────

router.get('/profile/templates', requireAuth, async (req, res) => {
  try {
    const names = await listTemplates(req.user!.id)
    res.json({ templates: names })
  } catch (error) {
    console.error('[profile/templates/list]', error)
    res.status(500).json({ error: 'Failed to list templates' })
  }
})

router.get('/profile/templates/:name', requireAuth, async (req, res) => {
  const name = String(req.params.name)
  try {
    const content = await readTemplate(req.user!.id, name)
    res.json({ content })
  } catch (error) {
    console.error('[profile/templates/get]', error)
    res.status(404).json({ error: `Template "${name}" not found` })
  }
})

router.put('/profile/templates/:name', requireAuth, async (req, res) => {
  const name = String(req.params.name)
  try {
    const { content } = req.body as { content?: string }
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Missing content field' })
      return
    }
    await writeTemplate(req.user!.id, name, content)
    res.json({ success: true })
  } catch (error) {
    console.error('[profile/templates/put]', error)
    res.status(500).json({ error: 'Failed to save template' })
  }
})

router.delete('/profile/templates/:name', requireAuth, async (req, res) => {
  const name = String(req.params.name)
  try {
    await deleteTemplate(req.user!.id, name)
    res.json({ success: true })
  } catch (error) {
    console.error('[profile/templates/delete]', error)
    res.status(500).json({ error: 'Failed to delete template' })
  }
})

// ─── ElevenLabs client-tool bridge ───────────────────────────────────────────
//
// The ElevenLabs ConvAI agent fires "client tool" calls. The browser intercepts
// them and proxies here. Each handler mirrors the corresponding MCP server tool.

router.post('/profile/tool/:name', requireAuth, async (req, res) => {
  const userId = req.user!.id
  const toolName = String(req.params.name)
  const params = req.body as Record<string, unknown>

  try {
    const result = await dispatchProfileTool(userId, toolName, params)
    res.json({ result })
  } catch (error) {
    console.error(`[profile/tool/${toolName}]`, error)
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

export async function dispatchProfileTool(
  userId: string,
  toolName: string,
  params: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    // ── Profile tools ──
    case 'read_profile': {
      const content = await readProfile(userId)
      const section = params.section as string | undefined
      if (section) {
        const extracted = extractSection(content, section)
        return extracted === null
          ? `Section "${section}" not found.`
          : `## ${section}\n${extracted}`
      }
      return content
    }

    case 'update_profile': {
      const section = params.section as string
      const content = params.content as string
      const mode = (params.mode as 'append' | 'replace') ?? 'append'
      const current = await readProfile(userId)
      const updated = replaceSection(current, section, content, mode)
      await updateProfile(userId, updated)
      return `Updated "${section}" (${mode}).`
    }

    case 'delete_profile_entry': {
      const section = params.section as string
      const entrySubstring = params.entry_substring as string
      const current = await readProfile(userId)
      const updated = deleteEntry(current, section, entrySubstring)
      if (updated === current) return `No matching entry found in "${section}".`
      await updateProfile(userId, updated)
      return `Removed entry from "${section}".`
    }

    case 'log_interaction': {
      const entry = params.entry as string
      const timestamp = new Date().toISOString()
      const current = await readProfile(userId)
      const updated = replaceSection(
        current,
        'Learned Patterns',
        `- [${timestamp}] ${entry}`,
        'append'
      )
      await updateProfile(userId, updated)
      return 'Logged to Learned Patterns.'
    }

    // ── Template tools ──
    case 'list_templates': {
      const names = await listTemplates(userId)
      return names.length === 0
        ? 'No templates saved yet.'
        : `Templates:\n${names.map((n) => `- ${n}`).join('\n')}`
    }

    case 'get_template': {
      return await readTemplate(userId, params.name as string)
    }

    case 'save_template': {
      await writeTemplate(userId, params.name as string, params.content as string)
      return `Template "${params.name}" saved.`
    }

    case 'delete_template': {
      await deleteTemplate(userId, params.name as string)
      return `Template "${params.name}" deleted.`
    }

    // ── Memory tools ──
    case 'save_conversation_note': {
      await appendToLog(userId, params.note as string)
      return "Note saved to today's log."
    }

    case 'get_conversation_log': {
      return await readLog(userId, params.date as string | undefined)
    }

    case 'list_conversation_history': {
      const dates = await listLogDates(userId)
      return dates.length === 0
        ? 'No conversation logs yet.'
        : `Logs available:\n${dates.map((d) => `- ${d}`).join('\n')}`
    }

    case 'search_conversation_logs': {
      const results = await searchLogs(
        userId,
        params.query as string,
        params.from_date as string | undefined,
        params.to_date as string | undefined
      )
      if (results.length === 0) return `No matches found for "${params.query}".`
      return results.map((r) => `[${r.date}] ${r.line}`).join('\n')
    }

    default:
      throw new Error(`Unknown profile tool: ${toolName}`)
  }
}

export default router
