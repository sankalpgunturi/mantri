import { createAdminClient } from '../lib/supabase.js'

const BUCKET = 'profiles'

// ─── Path helpers ────────────────────────────────────────────────────────────

function profilePath(userId: string) {
  return `${userId}/profile.md`
}

function templatePath(userId: string, name: string) {
  return `${userId}/templates/${name}.md`
}

function logPath(userId: string, date: string) {
  return `${userId}/logs/${date}.md`
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export async function readProfile(userId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(profilePath(userId))
  if (error) throw new Error(`Failed to read profile: ${error.message}`)
  return data.text()
}

export async function writeProfile(userId: string, content: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).upload(profilePath(userId), content, {
    contentType: 'text/markdown',
    upsert: true,
  })
  if (error) throw new Error(`Failed to write profile: ${error.message}`)
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates(userId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.storage.from(BUCKET).list(`${userId}/templates`)
  if (!data) return []
  return data
    .filter((f) => f.name.endsWith('.md'))
    .map((f) => f.name.replace(/\.md$/, ''))
}

export async function readTemplate(userId: string, name: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(templatePath(userId, name))
  if (error) throw new Error(`Template "${name}" not found: ${error.message}`)
  return data.text()
}

export async function writeTemplate(userId: string, name: string, content: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).upload(templatePath(userId, name), content, {
    contentType: 'text/markdown',
    upsert: true,
  })
  if (error) throw new Error(`Failed to save template "${name}": ${error.message}`)
}

export async function deleteTemplate(userId: string, name: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BUCKET).remove([templatePath(userId, name)])
  if (error) throw new Error(`Failed to delete template "${name}": ${error.message}`)
}

// ─── Conversation Logs ───────────────────────────────────────────────────────

export async function readLog(userId: string, date?: string): Promise<string> {
  const supabase = createAdminClient()
  const d = date ?? todayDate()
  const { data, error } = await supabase.storage.from(BUCKET).download(logPath(userId, d))
  if (error) throw new Error(`No conversation log found for ${d}: ${error.message}`)
  return data.text()
}

export async function appendToLog(userId: string, entry: string): Promise<void> {
  const supabase = createAdminClient()
  const date = todayDate()
  const path = logPath(userId, date)

  let existing = ''
  const { data } = await supabase.storage.from(BUCKET).download(path)
  if (data) {
    existing = await data.text()
  }

  const timestamp = new Date().toISOString().slice(11, 19)
  const updated = existing
    ? existing.trimEnd() + `\n[${timestamp}] ${entry}\n`
    : `# Conversation Log — ${date}\n\n[${timestamp}] ${entry}\n`

  const { error } = await supabase.storage.from(BUCKET).upload(path, updated, {
    contentType: 'text/markdown',
    upsert: true,
  })
  if (error) throw new Error(`Failed to write log: ${error.message}`)
}

export async function listLogDates(userId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase.storage.from(BUCKET).list(`${userId}/logs`)
  if (!data) return []
  return data
    .filter((f) => f.name.endsWith('.md'))
    .map((f) => f.name.replace(/\.md$/, ''))
    .sort()
    .reverse()
}

export async function searchLogs(
  userId: string,
  query: string,
  fromDate?: string,
  toDate?: string
): Promise<Array<{ date: string; line: string }>> {
  const dates = await listLogDates(userId)

  const filtered = dates.filter((d) => {
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })

  const supabase = createAdminClient()
  const results: Array<{ date: string; line: string }> = []
  const lowerQuery = query.toLowerCase()

  for (const date of filtered) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(logPath(userId, date))
    if (error || !data) continue

    const text = await data.text()
    for (const line of text.split('\n')) {
      if (line.toLowerCase().includes(lowerQuery)) {
        results.push({ date, line: line.trim() })
      }
    }
  }

  return results
}
