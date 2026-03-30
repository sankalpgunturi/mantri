import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Tool {
  slug: string
  name: string
  description: string
  inputSchema: Record<string, unknown> | null
}

interface Props {
  provider: string
  onClose: () => void
}

export default function DevPanel({ provider, onClose }: Props) {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Tool | null>(null)
  const [inputJson, setInputJson] = useState('{}')
  const [running, setRunning] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    async function loadTools() {
      try {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (!s) return
        const res = await fetch(`/api/dev/tools?provider=${provider}`, {
          headers: { Authorization: `Bearer ${s.access_token}` },
        })
        const data = await res.json() as { tools: Tool[] }
        setTools(data.tools ?? [])
      } catch (err) {
        console.error('[dev/tools]', err)
      } finally {
        setLoading(false)
      }
    }
    loadTools()
  }, [provider])

  function selectTool(tool: Tool) {
    setSelected(tool)
    setResponse(null)
    setJsonError(null)
    // Pre-fill only required fields with typed defaults
    try {
      type Schema = { properties?: Record<string, { type?: string }>; required?: string[] }
      const schema = tool.inputSchema as Schema | null
      const props = schema?.properties ?? {}
      const required = new Set(schema?.required ?? [])
      const prefill: Record<string, unknown> = {}
      for (const [key, def] of Object.entries(props)) {
        if (!required.has(key)) continue
        const t = def?.type
        prefill[key] = t === 'number' || t === 'integer' ? 0 : t === 'boolean' ? false : ''
      }
      setInputJson(JSON.stringify(prefill, null, 2))
    } catch {
      setInputJson('{}')
    }
  }

  function handleJsonChange(val: string) {
    setInputJson(val)
    try {
      JSON.parse(val)
      setJsonError(null)
    } catch {
      setJsonError('Invalid JSON')
    }
  }

  async function runTool() {
    if (!selected || jsonError) return
    setRunning(true)
    setResponse(null)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (!s) {
        setRunning(false)
        return
      }
      const res = await fetch('/api/dev/tools/run', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${s.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ toolSlug: selected.slug, inputs: JSON.parse(inputJson) }),
      })
      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setResponse(String(err))
    } finally {
      setRunning(false)
    }
  }

  const filtered = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="dev-overlay">
      <div className="dev-panel">
        {/* Header */}
        <div className="dev-header">
          <div className="dev-header-left">
            <span className="dev-badge-inline">DEV</span>
            <span className="dev-title">Tool Sandbox</span>
            <span className="dev-subtitle">
              {tools.length} tools · {provider === 'google' ? 'Gmail' : 'Outlook'}
            </span>
          </div>
          <button className="dev-close" onClick={onClose}>✕</button>
        </div>

        <div className="dev-body">
          {/* Tool list */}
          <div className="dev-sidebar">
            <input
              className="dev-search"
              placeholder="Search tools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {loading ? (
              <div className="dev-loading">Loading tools…</div>
            ) : (
              <div className="dev-tool-list">
                {filtered.map((t) => (
                  <button
                    key={t.slug}
                    className={`dev-tool-item ${selected?.slug === t.slug ? 'active' : ''}`}
                    onClick={() => selectTool(t)}
                  >
                    <span className="dev-tool-name">{t.name}</span>
                    <span className="dev-tool-slug">{t.slug}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="dev-loading">No tools match "{search}"</div>
                )}
              </div>
            )}
          </div>

          {/* Tool detail / executor */}
          <div className="dev-main">
            {!selected ? (
              <div className="dev-empty">← Select a tool to test it</div>
            ) : (
              <>
                <div className="dev-tool-header">
                  <div>
                    <div className="dev-tool-title">{selected.name}</div>
                    <div className="dev-tool-desc">{selected.description}</div>
                  </div>
                </div>

                <div className="dev-section-label">Input JSON</div>
                <textarea
                  className={`dev-textarea ${jsonError ? 'dev-textarea-error' : ''}`}
                  value={inputJson}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  spellCheck={false}
                />
                {jsonError && <div className="dev-error-msg">{jsonError}</div>}

                <button
                  className="dev-run-btn"
                  onClick={runTool}
                  disabled={running || !!jsonError}
                >
                  {running ? (
                    <><span className="spinner" aria-hidden /> Running…</>
                  ) : (
                    '▶  Run tool'
                  )}
                </button>

                {response && (
                  <>
                    <div className="dev-section-label">Response</div>
                    <pre className="dev-response">{response}</pre>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
