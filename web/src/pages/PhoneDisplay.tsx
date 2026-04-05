import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
  accessToken: string
  onEditProfile: () => void
}

export default function PhoneDisplay({ user, accessToken, onEditProfile }: Props) {
  const displayName = user.user_metadata?.full_name ?? user.email ?? ''
  const avatar = user.user_metadata?.avatar_url as string | undefined
  const firstName = (user.user_metadata?.full_name as string)?.split(' ')[0] ?? displayName

  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [registeredPhone, setRegisteredPhone] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/user/phone', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d: { phone_number: string | null }) => setRegisteredPhone(d.phone_number))
      .catch(() => {})
  }, [accessToken])

  async function handleCallMe() {
    setCallState('calling')
    setErrorMsg('')

    try {
      const res = await fetch('/api/user/call', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string; detail?: string }
        throw new Error(data.detail || data.error || 'Call failed')
      }

      setCallState('ringing')
      setTimeout(() => setCallState('idle'), 30000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setCallState('error')
      setTimeout(() => setCallState('idle'), 5000)
    }
  }

  const hintText =
    callState === 'ringing'
      ? 'Pick up — Mantri is calling you!'
      : callState === 'error'
        ? errorMsg
        : callState === 'calling'
          ? 'Connecting to Mantri…'
          : registeredPhone
            ? `We'll call ${registeredPhone}`
            : 'Tap to get a call from your assistant'

  return (
    <div className="home-shell">
      {/* Top bar */}
      <header className="home-topbar">
        <span className="home-wordmark">Mantri</span>
        <div className="home-topbar-right">
          <button className="home-profile-btn" onClick={onEditProfile}>
            Settings
          </button>
          <button className="home-signout-btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="home-main">
        <div className="home-greeting">
          {avatar && (
            <img src={avatar} alt="" className="home-avatar" referrerPolicy="no-referrer" />
          )}
          <h1 className="home-hello">Hey, {firstName}</h1>
          <p className="home-subtitle">Ready to catch up on emails?</p>
        </div>

        <button
          className={`home-call-btn ${callState}`}
          onClick={handleCallMe}
          disabled={callState === 'calling' || callState === 'ringing'}
        >
          <span className="home-call-btn-inner">
            {callState === 'idle' && (
              <>
                <svg className="home-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>Call me</span>
              </>
            )}
            {callState === 'calling' && (
              <>
                <span className="home-call-spinner" />
                <span>Connecting…</span>
              </>
            )}
            {callState === 'ringing' && (
              <>
                <svg className="home-call-icon ringing" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>Ringing…</span>
              </>
            )}
            {callState === 'error' && <span>Try again</span>}
          </span>
        </button>

        <p className="home-hint">{hintText}</p>
      </main>
    </div>
  )
}
