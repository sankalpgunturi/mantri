import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
}

export default function Dashboard({ user }: Props) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  const name = user.user_metadata?.full_name ?? user.email
  const avatar = user.user_metadata?.avatar_url as string | undefined
  const provider = (user.app_metadata?.provider as string | undefined) ?? 'google'
  const emailLabel = provider === 'google' ? 'Gmail' : 'Outlook'

  return (
    <div className="dashboard-wrapper">
      {avatar && (
        <img src={avatar} alt={name} className="avatar" referrerPolicy="no-referrer" />
      )}
      <h1 className="welcome">Welcome, {name}</h1>
      <p className="email">{user.email}</p>

      <div className="status-badge">
        <span className="badge success">{emailLabel} connected</span>
      </div>

      <button className="sign-out-btn" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  )
}
