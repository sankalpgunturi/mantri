import type { Request, Response, NextFunction } from 'express'

const BRIDGE_SECRET = process.env.BOLNA_BRIDGE_SECRET

export function requireBolnaAuth(req: Request, res: Response, next: NextFunction) {
  if (!BRIDGE_SECRET) {
    res.status(500).json({ error: 'BOLNA_BRIDGE_SECRET is not configured' })
    return
  }

  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${BRIDGE_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
