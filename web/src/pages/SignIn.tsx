import { useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type Provider = 'google' | 'azure'

export default function SignIn() {
  const [loading, setLoading] = useState<Provider | null>(null)

  async function signIn(provider: Provider) {
    setLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
        scopes: provider === 'azure' ? 'email profile' : undefined,
      },
    })
    setLoading(null)
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-header">
        <h1>Mantri</h1>
        <p>Sign in to continue</p>
      </div>
      <div className="auth-card">
        <OAuthButton
          onClick={() => signIn('google')}
          loading={loading === 'google'}
          icon={<GoogleIcon />}
          label="Sign in with Google"
        />
        <OAuthButton
          onClick={() => signIn('azure')}
          loading={loading === 'azure'}
          icon={<MicrosoftIcon />}
          label="Sign in with Microsoft"
        />
      </div>
    </div>
  )
}

interface OAuthButtonProps {
  onClick: () => void
  loading: boolean
  icon: ReactNode
  label: string
}

function OAuthButton({ onClick, loading, icon, label }: OAuthButtonProps) {
  return (
    <button className="oauth-btn" onClick={onClick} disabled={loading}>
      {loading ? <Spinner /> : icon}
      <span>{loading ? 'Redirecting…' : label}</span>
    </button>
  )
}

function Spinner() {
  return <span className="spinner" aria-hidden />
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="7.5" height="7.5" fill="#F25022" />
      <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  )
}
