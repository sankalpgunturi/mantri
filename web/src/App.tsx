import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignIn from './pages/SignIn'
import Dashboard from './pages/Dashboard'
import DevPanel from './pages/DevPanel'

type AppState = 'loading' | 'unauthenticated' | 'onboarding' | 'ready'

function getProvider(session: Session): string {
  return (
    (session.user.app_metadata?.provider as string | undefined) ??
    (session.user.identities?.[0]?.provider as string | undefined) ??
    'google'
  )
}

declare global {
  interface Window {
    toggleDevMode: () => void
  }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [devMode, setDevMode] = useState(() => localStorage.getItem('mantri_dev') === '1')
  const [devPanelOpen, setDevPanelOpen] = useState(false)
  const devModeRef = useRef(devMode)

  useEffect(() => {
    devModeRef.current = devMode
    window.toggleDevMode = () => {
      const next = !devModeRef.current
      devModeRef.current = next
      localStorage.setItem('mantri_dev', next ? '1' : '0')
      setDevMode(next)
      if (next) setDevPanelOpen(true)
      console.log(`%c Mantri dev mode ${next ? 'ON 🟢' : 'OFF 🔴'}`, 'font-weight:bold;font-size:14px')
    }
  }, [devMode])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
        runOnboarding(session)
      } else {
        setAppState('unauthenticated')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSession(null)
        setAppState('unauthenticated')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function runOnboarding(session: Session) {
    setAppState('onboarding')

    // If Composio just redirected us back after a successful OAuth grant,
    // trust the connection is made and skip straight to the dashboard.
    // This also prevents an infinite redirect loop if the status check races
    // against Composio's propagation delay.
    const params = new URLSearchParams(window.location.search)
    if (params.get('status') === 'success') {
      window.history.replaceState({}, '', window.location.pathname)
      setAppState('ready')
      return
    }

    try {
      // Step 1: ensure profile.md exists
      await fetch('/api/profile/init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      // Step 2: check if email toolkit is already connected
      const provider = getProvider(session)
      const statusRes = await fetch(`/api/email/status?provider=${provider}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const status = await statusRes.json() as { connected: boolean }

      if (status.connected) {
        setAppState('ready')
        return
      }

      // Step 3: not connected — auto-redirect to Composio Connect Link
      const connectRes = await fetch('/api/email/connect', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider }),
      })

      if (!connectRes.ok) {
        console.error('[onboarding] email/connect failed:', await connectRes.text())
        setAppState('ready')
        return
      }

      const { redirectUrl } = await connectRes.json() as { redirectUrl: string }
      window.location.href = redirectUrl
    } catch (err) {
      console.error('[onboarding]', err)
      // fail open: show dashboard even if onboarding checks fail
      setAppState('ready')
    }
  }

  if (appState === 'loading' || appState === 'onboarding') {
    return (
      <div className="loading-screen">
        <span className="loading-wordmark">Mantri</span>
        <div className="loading-spinner" />
        {appState === 'onboarding' && (
          <p className="loading-label">Connecting your account…</p>
        )}
      </div>
    )
  }

  if (appState === 'unauthenticated' || !session) {
    return <SignIn />
  }

  const provider = getProvider(session)

  return (
    <>
      <Dashboard
        user={session.user}
        devMode={devMode}
        onOpenDevPanel={() => setDevPanelOpen(true)}
      />
      {devMode && devPanelOpen && (
        <DevPanel
          provider={provider}
          onClose={() => setDevPanelOpen(false)}
        />
      )}
    </>
  )
}
