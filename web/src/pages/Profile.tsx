import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Props {
  user: User
  accessToken: string
}

type ActiveFile = 'profile' | { type: 'template'; name: string } | 'new-template'

function apiFetch(path: string, accessToken: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  })
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="md-h1">{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="md-h2">{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="md-h3">{line.slice(4)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="md-li">{line.slice(2)}</li>)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="md-spacer" />)
    } else {
      elements.push(<p key={i} className="md-p">{line}</p>)
    }
  }
  return <div className="md-preview">{elements}</div>
}

export default function Profile({ user, accessToken }: Props) {
  const [activeFile, setActiveFile] = useState<ActiveFile>('profile')

  const [profileSaved, setProfileSaved] = useState('')
  const [profileDraft, setProfileDraft] = useState('')

  const [templates, setTemplates] = useState<string[]>([])
  const [templateContents, setTemplateContents] = useState<Record<string, string>>({})
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>({})

  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateContent, setNewTemplateContent] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  const displayName = user.user_metadata?.full_name ?? user.email
  const avatar = user.user_metadata?.avatar_url as string | undefined

  useEffect(() => {
    loadProfile()
    loadTemplates()
  }, [])

  useEffect(() => {
    if (typeof activeFile === 'object' && activeFile.type === 'template') {
      ensureTemplateLoaded(activeFile.name)
    }
  }, [activeFile])

  async function loadProfile() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/profile', accessToken)
      const data = await res.json() as { content?: string }
      const content = data.content ?? ''
      setProfileSaved(content)
      setProfileDraft(content)
    } finally {
      setLoading(false)
    }
  }

  async function loadTemplates() {
    const res = await apiFetch('/api/profile/templates', accessToken)
    const data = await res.json() as { templates?: string[] }
    setTemplates(data.templates ?? [])
  }

  async function ensureTemplateLoaded(name: string) {
    if (templateContents[name] !== undefined) return
    const res = await apiFetch(`/api/profile/templates/${name}`, accessToken)
    const data = await res.json() as { content?: string }
    const content = data.content ?? ''
    setTemplateContents((prev) => ({ ...prev, [name]: content }))
    setTemplateDrafts((prev) => ({ ...prev, [name]: content }))
  }

  async function save() {
    setSaving(true)
    setSaveError('')
    try {
      if (activeFile === 'profile') {
        const res = await apiFetch('/api/profile', accessToken, {
          method: 'PUT',
          body: JSON.stringify({ content: profileDraft }),
        })
        if (!res.ok) throw new Error(await res.text())
        setProfileSaved(profileDraft)
      } else if (typeof activeFile === 'object' && activeFile.type === 'template') {
        const { name } = activeFile
        const content = templateDrafts[name] ?? ''
        const res = await apiFetch(`/api/profile/templates/${name}`, accessToken, {
          method: 'PUT',
          body: JSON.stringify({ content }),
        })
        if (!res.ok) throw new Error(await res.text())
        setTemplateContents((prev) => ({ ...prev, [name]: content }))
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateTemplate() {
    const name = newTemplateName.trim()
    if (!name) return
    setSaving(true)
    try {
      const content = newTemplateContent
      await apiFetch(`/api/profile/templates/${name}`, accessToken, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      })
      setTemplateContents((prev) => ({ ...prev, [name]: content }))
      setTemplateDrafts((prev) => ({ ...prev, [name]: content }))
      setTemplates((prev) => [...prev, name])
      setNewTemplateName('')
      setNewTemplateContent('')
      setActiveFile({ type: 'template', name })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTemplate(name: string) {
    if (!confirm(`Delete template "${name}"?`)) return
    await apiFetch(`/api/profile/templates/${name}`, accessToken, { method: 'DELETE' })
    setTemplates((prev) => prev.filter((t) => t !== name))
    setTemplateContents(({ [name]: _, ...rest }) => rest)
    setTemplateDrafts(({ [name]: _, ...rest }) => rest)
    if (typeof activeFile === 'object' && activeFile.name === name) {
      setActiveFile('profile')
    }
  }

  // ─── Derive current editor state ──────────────────────────────────────────

  let savedContent = ''
  let draftContent = ''

  if (activeFile === 'profile') {
    savedContent = profileSaved
    draftContent = profileDraft
  } else if (typeof activeFile === 'object' && activeFile.type === 'template') {
    const n = activeFile.name
    savedContent = templateContents[n] ?? ''
    draftContent = templateDrafts[n] ?? ''
  }

  const isDirty = draftContent !== savedContent

  function setDraft(value: string) {
    if (activeFile === 'profile') {
      setProfileDraft(value)
    } else if (typeof activeFile === 'object' && activeFile.type === 'template') {
      const n = activeFile.name
      setTemplateDrafts((prev) => ({ ...prev, [n]: value }))
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <span className="loading-wordmark">Mantri</span>
        <div className="loading-spinner" />
      </div>
    )
  }

  const filename =
    activeFile === 'profile'
      ? 'profile.md'
      : activeFile === 'new-template'
      ? 'new template'
      : typeof activeFile === 'object'
      ? `${activeFile.name}.md`
      : ''

  return (
    <div className="editor-shell">
      {/* Sidebar */}
      <aside className="editor-sidebar">
        <div className="editor-sidebar-top">
          <span className="editor-wordmark">Mantri</span>

          <nav className="editor-nav">
            <span className="editor-nav-label">Profile</span>
            <button
              className={`editor-nav-item ${activeFile === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveFile('profile')}
            >
              profile.md
            </button>

            {templates.length > 0 && (
              <span className="editor-nav-label" style={{ marginTop: '1rem' }}>Templates</span>
            )}
            {templates.map((name) => (
              <div key={name} className="editor-nav-row">
                <button
                  className={`editor-nav-item ${
                    typeof activeFile === 'object' &&
                    activeFile.type === 'template' &&
                    activeFile.name === name
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => setActiveFile({ type: 'template', name })}
                >
                  {name}
                </button>
                <button
                  className="editor-nav-delete"
                  onClick={() => handleDeleteTemplate(name)}
                  title={`Delete ${name}`}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              className={`editor-nav-item editor-nav-new ${activeFile === 'new-template' ? 'active' : ''}`}
              onClick={() => setActiveFile('new-template')}
            >
              + New template
            </button>
          </nav>
        </div>

        <div className="editor-sidebar-bottom">
          {avatar && (
            <img src={avatar} alt="" className="editor-avatar" referrerPolicy="no-referrer" />
          )}
          <span className="editor-user-name">{displayName}</span>
          <button className="editor-signout-btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main editor */}
      <main className="editor-main">
        <div className="editor-tabbar">
          <span className="editor-tab-filename">{filename}</span>
        </div>

        {saveError && <p className="editor-save-error">{saveError}</p>}

        {activeFile === 'new-template' ? (
          <div className="editor-new-template">
            <input
              className="editor-name-input"
              placeholder="Template name (e.g. rejection_reply)"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTemplate()}
              autoFocus
            />
            <div className="editor-split">
              <textarea
                className="editor-textarea"
                placeholder="Write your template here…"
                value={newTemplateContent}
                onChange={(e) => setNewTemplateContent(e.target.value)}
                spellCheck={false}
              />
              <div className="editor-preview-scroll">
                <SimpleMarkdown content={newTemplateContent} />
              </div>
            </div>
            <div className="editor-savebar editor-savebar-visible">
              <button
                className="editor-save-btn"
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || saving}
              >
                {saving ? 'Creating…' : 'Create template'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="editor-split">
              <textarea
                className="editor-textarea"
                value={draftContent}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
              />
              <div className="editor-preview-scroll">
                <SimpleMarkdown content={draftContent} />
              </div>
            </div>

            <div className={`editor-savebar ${isDirty ? 'editor-savebar-visible' : ''}`}>
              <button
                className="editor-save-btn"
                onClick={save}
                disabled={saving || !isDirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
