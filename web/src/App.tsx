import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignIn from './pages/SignIn'
import DevPanel from './pages/DevPanel'
import Profile from './pages/Profile'
import PhoneDisplay from './pages/PhoneDisplay'
import PhoneRegistration from './pages/PhoneRegistration'

type AppState =
  | 'loading'
  | 'unauthenticated'
  | 'onboarding'
  | 'phone-registration'
  | 'ready'
  | 'editing-profile'

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

/**
 * Builds a map of profile tool handlers for ElevenLabs ConvAI client tools.
 * Each handler proxies the tool call to POST /api/profile/tool/:name with the
 * user's Supabase Bearer token. Wire these into your ElevenLabs conversation
 * setup when integrating the voice agent.
 *
 * Usage with ElevenLabs:
 *   const handlers = buildProfileToolHandlers(session.access_token)
 *   // pass handlers.read_profile, handlers.update_profile, etc. as client tools
 */
export function buildProfileToolHandlers(
  accessToken: string
): Record<string, (params: Record<string, unknown>) => Promise<string>> {
  const TOOL_NAMES = [
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
  ] as const

  const handlers: Record<string, (params: Record<string, unknown>) => Promise<string>> = {}

  for (const name of TOOL_NAMES) {
    handlers[name] = async (params) => {
      const res = await fetch(`/api/profile/tool/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(params),
      })
      const data = await res.json() as { result?: string; error?: string }
      return data.result ?? data.error ?? 'Done.'
    }
  }

  return handlers
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
      console.log(`%c Mantri dev mode ${next ? 'ON' : 'OFF'}`, 'font-weight:bold;font-size:14px')
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

    const params = new URLSearchParams(window.location.search)
    if (params.get('status') === 'success') {
      window.history.replaceState({}, '', window.location.pathname)
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

      if (!status.connected && !params.get('status')) {
        // Not connected — redirect to Composio
        const connectRes = await fetch('/api/email/connect', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider }),
        })

        if (connectRes.ok) {
          const { redirectUrl } = await connectRes.json() as { redirectUrl: string }
          window.location.href = redirectUrl
          return
        }
      }

      // Step 3: check if phone number is registered
      const phoneRes = await fetch('/api/user/phone', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const phoneData = await phoneRes.json() as { phone_number: string | null }

      if (!phoneData.phone_number) {
        setAppState('phone-registration')
      } else {
        setAppState('ready')
      }
    } catch (err) {
      console.error('[onboarding]', err)
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

  if (appState === 'phone-registration') {
    return (
      <PhoneRegistration
        accessToken={session.access_token}
        provider={provider}
        onComplete={() => setAppState('ready')}
      />
    )
  }

  if (appState === 'editing-profile') {
    return (
      <Profile
        user={session.user}
        accessToken={session.access_token}
        onBack={() => setAppState('ready')}
      />
    )
  }

  return (
    <>
      <PhoneDisplay
        user={session.user}
        accessToken={session.access_token}
        onEditProfile={() => setAppState('editing-profile')}
      />
      {devMode && (
        <button
          className="dev-badge"
          onClick={() => setDevPanelOpen(true)}
          title="Open tool sandbox"
        >
          DEV
        </button>
      )}
      {devMode && devPanelOpen && (
        <DevPanel
          provider={provider}
          onClose={() => setDevPanelOpen(false)}
        />
      )}
    </>
  )
}
