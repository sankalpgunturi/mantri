import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { initProfile } from '../services/profile-storage.js'

const router = Router()

router.post('/profile/init', requireAuth, async (req, res) => {
  try {
    await initProfile(req.user!.id, req.accessToken!)
    res.json({ success: true })
  } catch (error) {
    console.error('[profile/init]', error)
    res.status(500).json({ error: 'Failed to initialize profile' })
  }
})

export default router
