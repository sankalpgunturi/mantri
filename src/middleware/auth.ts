import { Request, Response, NextFunction } from 'express'
import { supabaseAnon } from '../lib/supabase.js'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string }
      accessToken?: string
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' })
    return
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAnon.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.user = { id: user.id, email: user.email }
  req.accessToken = token
  next()
}
