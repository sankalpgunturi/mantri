import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createAdminClient } from '../lib/supabase.js'
import { readProfile } from '../services/profile-storage.js'

const router = Router()

// ─── Phone number registration ────────────────────────────────────────────────

router.post('/user/phone', requireAuth, async (req, res) => {
  const { phone_number, provider } = req.body as { phone_number?: string; provider?: string }

  if (!phone_number || typeof phone_number !== 'string') {
    res.status(400).json({ error: 'Missing phone_number field' })
    return
  }

  const e164 = phone_number.replace(/\s/g, '')
  if (!/^\+\d{7,15}$/.test(e164)) {
    res.status(400).json({ error: 'Invalid phone number. Use E.164 format (e.g. +14155551234)' })
    return
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('user_metadata')
      .upsert(
        {
          user_id: req.user!.id,
          phone_number: e164,
          provider: provider ?? 'google',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'This phone number is already registered to another account' })
        return
      }
      throw error
    }

    res.json({ success: true, phone_number: e164 })
  } catch (error) {
    console.error('[user/phone]', error)
    res.status(500).json({ error: 'Failed to register phone number' })
  }
})

router.get('/user/phone', requireAuth, async (req, res) => {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('user_metadata')
      .select('phone_number')
      .eq('user_id', req.user!.id)
      .single()

    res.json({ phone_number: data?.phone_number ?? null })
  } catch (error) {
    console.error('[user/phone]', error)
    res.status(500).json({ error: 'Failed to fetch phone number' })
  }
})

// ─── Trigger outbound call ────────────────────────────────────────────────────

router.post('/user/call', requireAuth, async (req, res) => {
  const agentId = process.env.BOLNA_AGENT_ID
  const bolnaKey = process.env.BOLNA_API_KEY
  if (!agentId || !bolnaKey) {
    res.status(500).json({ error: 'Bolna agent not configured' })
    return
  }

  try {
    const supabase = createAdminClient()
    const { data: meta } = await supabase
      .from('user_metadata')
      .select('phone_number')
      .eq('user_id', req.user!.id)
      .single()

    if (!meta?.phone_number) {
      res.status(400).json({ error: 'No phone number registered. Please add your phone number first.' })
      return
    }

    let profileContent = 'No profile found.'
    try {
      profileContent = await readProfile(req.user!.id)
    } catch {
      /* profile may not exist yet */
    }

    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(req.user!.id)
    const userName =
      authUser?.user_metadata?.full_name ??
      authUser?.user_metadata?.name ??
      req.user!.email ??
      'User'

    const bolnaRes = await fetch('https://api.bolna.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bolnaKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        recipient_phone_number: meta.phone_number,
        user_data: {
          user_id: req.user!.id,
          profile_content: profileContent,
          user_name: userName,
          timezone: 'Asia/Kolkata',
        },
      }),
    })

    if (!bolnaRes.ok) {
      const errBody = await bolnaRes.text()
      console.error('[user/call] Bolna error:', errBody)
      res.status(502).json({ error: 'Failed to initiate call', detail: errBody })
      return
    }

    const result = await bolnaRes.json()
    res.json({ success: true, execution_id: result.execution_id, status: result.status })
  } catch (error) {
    console.error('[user/call]', error)
    res.status(500).json({ error: 'Failed to initiate call' })
  }
})

export default router
