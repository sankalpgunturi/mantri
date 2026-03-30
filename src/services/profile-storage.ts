import { createUserClient, createAdminClient } from '../lib/supabase.js'

const BUCKET = 'profiles'

function profilePath(userId: string) {
  return `${userId}/profile.md`
}

const PROFILE_TEMPLATE = `# Profile

## About Me

<!-- The AI agent will fill this in as it learns more about you -->

## Preferences

<!-- Communication style, topics of interest, etc. -->

## Notes

<!-- Important context the agent should always remember -->
`

/**
 * Creates profile.md for a new user if it doesn't already exist.
 * Uses the user's own access token so Storage RLS is satisfied.
 */
export async function initProfile(userId: string, accessToken: string): Promise<void> {
  const supabase = createUserClient(accessToken)

  const { data: existing } = await supabase.storage
    .from(BUCKET)
    .list(userId)

  if (existing?.some((f) => f.name === 'profile.md')) return

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(profilePath(userId), PROFILE_TEMPLATE, {
      contentType: 'text/markdown',
    })

  if (error) throw new Error(`Failed to create profile: ${error.message}`)
}

/**
 * Reads profile.md content for a user.
 * Uses the admin client — intended for server-side MCP tool calls.
 */
export async function readProfile(userId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(profilePath(userId))

  if (error) throw new Error(`Failed to read profile: ${error.message}`)
  return data.text()
}

/**
 * Overwrites profile.md content for a user.
 * Uses the admin client — intended for server-side MCP tool calls.
 */
export async function updateProfile(userId: string, content: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(profilePath(userId), content, {
      contentType: 'text/markdown',
      upsert: true,
    })

  if (error) throw new Error(`Failed to update profile: ${error.message}`)
}
