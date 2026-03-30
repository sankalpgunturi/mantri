import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
}

export default function Dashboard({ user }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('loading')

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const res = await fetch('/api/profile/init', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        })

        if (!res.ok) throw new Error(await res.text())
        setStatus('done')
      } catch (err) {
        console.error('[profile/init]', err)
        setStatus('error')
      }
    }

    init()
  }, [user.id])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const name = user.user_metadata?.full_name ?? user.email
  const avatar = user.user_metadata?.avatar_url as string | undefined

  return (
    <div className="dashboard-wrapper">
      {avatar && (
        <img src={avatar} alt={name} className="avatar" />
      )}
      <h1 className="welcome">Welcome, {name}</h1>
      <p className="email">{user.email}</p>

      <div className="status-badge">
        {status === 'loading' && <span className="badge neutral">Initializing profile…</span>}
        {status === 'done' && <span className="badge success">Profile ready in Supabase Storage</span>}
        {status === 'error' && <span className="badge error">Profile init failed — check console</span>}
      </div>

      <button className="sign-out-btn" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  )
}
