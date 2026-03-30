import { Composio } from '@composio/core'

export const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! })

export type EmailToolkit = 'gmail' | 'outlook'

/**
 * Maps a Supabase OAuth provider to the matching Composio email toolkit slug.
 * Google sign-in → Gmail, Azure (Microsoft) sign-in → Outlook.
 */
export function emailToolkitForProvider(provider: string): EmailToolkit {
  return provider === 'google' ? 'gmail' : 'outlook'
}
