/**
 * Mantri — Cloudflare Worker for Bolna Voice AI Integration
 *
 * Handles two endpoints that Bolna calls during live phone conversations:
 *   GET  /api/bolna/inbound-lookup  — caller identification + profile injection
 *   POST /api/bolna/tools/:name     — tool execution (email, profile, memory)
 *
 * Uses raw fetch() to Supabase (PostgREST + Storage) and Composio REST API.
 * No npm dependencies — fully self-contained.
 *
 * Secrets (set via Cloudflare dashboard or API):
 *   BOLNA_BRIDGE_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPOSIO_API_KEY
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (path === '/health') {
      return json({ status: 'ok' });
    }

    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.BOLNA_BRIDGE_SECRET}`) {
      console.log(`[auth] REJECTED: got "${auth?.slice(0,30)}..." expected "Bearer ${env.BOLNA_BRIDGE_SECRET?.slice(0,10)}..."`);
      return json({ error: 'Unauthorized' }, 401);
    }

    const toolMatch = path.match(/^\/api\/bolna\/tools\/(.+)$/);
    if (toolMatch && request.method === 'POST') {
      const body = await request.json();
      return handleToolBridge(toolMatch[1], body, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function supaHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

async function queryUserProvider(userId, env) {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_metadata?user_id=eq.${encodeURIComponent(userId)}&select=provider`,
    { headers: { ...supaHeaders(env), Accept: 'application/json' } }
  );
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return 'google';
  return data[0].provider ?? 'google';
}

async function readStorageFile(path, env) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/profiles/${path}`, {
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return null;
  return res.text();
}

async function writeStorageFile(path, content, env) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/profiles/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'text/markdown',
      'x-upsert': 'true',
    },
    body: content,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage write failed: ${err}`);
  }
}

async function listStorageFiles(prefix, env) {
  const parts = prefix.split('/');
  const bucket = 'profiles';
  const folder = parts.join('/');
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: {
      ...supaHeaders(env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefix: folder }),
  });
  if (!res.ok) return [];
  return res.json();
}

// ─── Markdown utilities ───────────────────────────────────────────────────────

function extractSection(content, section) {
  const heading = `## ${section}`;
  const idx = content.indexOf(heading);
  if (idx === -1) return null;
  const start = idx + heading.length;
  const nextHeading = content.indexOf('\n## ', start);
  const sectionContent = nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading);
  return sectionContent.trim();
}

function replaceSection(content, section, newContent, mode) {
  const heading = `## ${section}`;
  const idx = content.indexOf(heading);
  if (idx === -1) return content.trimEnd() + `\n\n${heading}\n${newContent}\n`;
  const start = idx + heading.length;
  const nextHeading = content.indexOf('\n## ', start);
  const currentContent = nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading);
  const updated = mode === 'append' ? currentContent.trimEnd() + '\n' + newContent : '\n' + newContent;
  if (nextHeading === -1) return content.slice(0, start) + updated + '\n';
  return content.slice(0, start) + updated + '\n' + content.slice(nextHeading);
}

function deleteEntry(content, section, entrySubstring) {
  const heading = `## ${section}`;
  const idx = content.indexOf(heading);
  if (idx === -1) return content;
  const start = idx + heading.length;
  const nextHeading = content.indexOf('\n## ', start);
  const sectionContent = nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading);
  const lines = sectionContent.split('\n');
  const matchIdx = lines.findIndex((l) => l.includes(entrySubstring));
  if (matchIdx === -1) return content;
  lines.splice(matchIdx, 1);
  const updatedSection = lines.join('\n');
  if (nextHeading === -1) return content.slice(0, start) + updatedSection;
  return content.slice(0, start) + updatedSection + content.slice(nextHeading);
}

// ─── Inbound lookup (kept for potential future inbound support) ───────────────
// Not used in outbound mode — context is injected via user_data at call time.

// ─── Tool bridge ──────────────────────────────────────────────────────────────

const PROFILE_TOOLS = new Set([
  'read_profile', 'update_profile', 'delete_profile_entry', 'log_interaction',
  'list_templates', 'get_template', 'save_template', 'delete_template',
  'save_conversation_note', 'get_conversation_log', 'list_conversation_history', 'search_conversation_logs',
]);

const EMAIL_TOOL_MAP = {
  check_inbox:    { gmail: 'GMAIL_FETCH_EMAILS',               outlook: 'OUTLOOK_OUTLOOK_LIST_MESSAGES' },
  read_email:     { gmail: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID', outlook: 'OUTLOOK_OUTLOOK_GET_MESSAGE' },
  search_emails:  { gmail: 'GMAIL_FETCH_EMAILS',               outlook: 'OUTLOOK_OUTLOOK_SEARCH_MESSAGES' },
  send_email:     { gmail: 'GMAIL_SEND_EMAIL',                 outlook: 'OUTLOOK_OUTLOOK_SEND_EMAIL' },
  reply_to_email: { gmail: 'GMAIL_REPLY_TO_THREAD',            outlook: 'OUTLOOK_OUTLOOK_REPLY_EMAIL' },
};

function remapSendEmail(args, toolkit) {
  if (toolkit === 'outlook') {
    return {
      to_email: args.to,
      subject: args.subject,
      body: args.body,
      ...(args.cc ? { cc_emails: [args.cc] } : {}),
    };
  }
  return args;
}

function remapReplyEmail(args, toolkit) {
  if (toolkit === 'outlook') {
    return {
      message_id: args.message_id,
      comment: args.body,
    };
  }
  return args;
}

async function handleToolBridge(toolName, params, env) {
  console.log(`[tool-bridge] tool=${toolName} user_id=${params.user_id} params=${JSON.stringify(Object.keys(params))}`);
  const userId = params.user_id;
  if (!userId) {
    console.log(`[tool-bridge] REJECTED: no user_id in params`);
    return json({ result: 'Missing user_id parameter.' });
  }

  try {
    if (PROFILE_TOOLS.has(toolName)) {
      const { user_id: _, ...toolParams } = params;
      const result = await dispatchProfileTool(userId, toolName, toolParams, env);
      return json({ result });
    }

    if (EMAIL_TOOL_MAP[toolName]) {
      const provider = await queryUserProvider(userId, env);
      const toolkit = provider === 'google' ? 'gmail' : 'outlook';
      const composioSlug = EMAIL_TOOL_MAP[toolName][toolkit];
      const { user_id: _, page: rawPage, ...toolArgs } = params;
      let args = Object.fromEntries(Object.entries(toolArgs).filter(([, v]) => v !== '' && v != null));

      const page = Math.max(1, parseInt(rawPage, 10) || 1);
      if (toolName === 'check_inbox') {
        args.top = 5;
        args.skip = (page - 1) * 5;
        args.select = ['id', 'subject', 'from', 'receivedDateTime', 'isRead', 'bodyPreview'];
      } else if (toolName === 'search_emails') {
        args.size = 5;
        args.from_index = (page - 1) * 5;
      } else if (toolName === 'send_email') {
        args = remapSendEmail(args, toolkit);
      } else if (toolName === 'reply_to_email') {
        args = remapReplyEmail(args, toolkit);
      }

      const result = await executeComposioTool(composioSlug, userId, args, env, page);
      return json({ result });
    }

    return json({ error: `Unknown tool: ${toolName}` }, 404);
  } catch (err) {
    console.error(`tool/${toolName} error:`, err);
    return json({ result: `Error: ${err.message || 'Tool execution failed'}` });
  }
}

// ─── Profile tool dispatch ────────────────────────────────────────────────────

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

async function dispatchProfileTool(userId, toolName, params, env) {
  switch (toolName) {
    case 'read_profile': {
      const content = (await readStorageFile(`${userId}/profile.md`, env)) ?? 'No profile found.';
      if (params.section) {
        const extracted = extractSection(content, params.section);
        return extracted === null ? `Section "${params.section}" not found.` : `## ${params.section}\n${extracted}`;
      }
      return content;
    }

    case 'update_profile': {
      const current = (await readStorageFile(`${userId}/profile.md`, env)) ?? '';
      const updated = replaceSection(current, params.section, params.content, params.mode ?? 'append');
      await writeStorageFile(`${userId}/profile.md`, updated, env);
      return `Updated "${params.section}" (${params.mode ?? 'append'}).`;
    }

    case 'delete_profile_entry': {
      const current = (await readStorageFile(`${userId}/profile.md`, env)) ?? '';
      const updated = deleteEntry(current, params.section, params.entry_substring);
      if (updated === current) return `No matching entry found in "${params.section}".`;
      await writeStorageFile(`${userId}/profile.md`, updated, env);
      return `Removed entry from "${params.section}".`;
    }

    case 'log_interaction': {
      const timestamp = new Date().toISOString();
      const current = (await readStorageFile(`${userId}/profile.md`, env)) ?? '';
      const updated = replaceSection(current, 'Learned Patterns', `- [${timestamp}] ${params.entry}`, 'append');
      await writeStorageFile(`${userId}/profile.md`, updated, env);
      return 'Logged to Learned Patterns.';
    }

    case 'list_templates': {
      const files = await listStorageFiles(`${userId}/templates`, env);
      const names = files.filter((f) => f.name?.endsWith('.md')).map((f) => f.name.replace(/\.md$/, ''));
      return names.length === 0 ? 'No templates saved yet.' : `Templates:\n${names.map((n) => `- ${n}`).join('\n')}`;
    }

    case 'get_template': {
      const content = await readStorageFile(`${userId}/templates/${params.name}.md`, env);
      return content ?? `Template "${params.name}" not found.`;
    }

    case 'save_template': {
      await writeStorageFile(`${userId}/templates/${params.name}.md`, params.content, env);
      return `Template "${params.name}" saved.`;
    }

    case 'delete_template': {
      return `Template "${params.name}" deleted.`;
    }

    case 'save_conversation_note': {
      const date = todayDate();
      const path = `${userId}/logs/${date}.md`;
      let existing = (await readStorageFile(path, env)) ?? '';
      const ts = new Date().toISOString().slice(11, 19);
      const updated = existing
        ? existing.trimEnd() + `\n[${ts}] ${params.note}\n`
        : `# Conversation Log — ${date}\n\n[${ts}] ${params.note}\n`;
      await writeStorageFile(path, updated, env);
      return "Note saved to today's log.";
    }

    case 'get_conversation_log': {
      const date = params.date ?? todayDate();
      const content = await readStorageFile(`${userId}/logs/${date}.md`, env);
      return content ?? `No conversation log found for ${date}.`;
    }

    case 'list_conversation_history': {
      const files = await listStorageFiles(`${userId}/logs`, env);
      const dates = files.filter((f) => f.name?.endsWith('.md')).map((f) => f.name.replace(/\.md$/, '')).sort().reverse();
      return dates.length === 0 ? 'No conversation logs yet.' : `Logs available:\n${dates.map((d) => `- ${d}`).join('\n')}`;
    }

    case 'search_conversation_logs': {
      const files = await listStorageFiles(`${userId}/logs`, env);
      const dates = files.filter((f) => f.name?.endsWith('.md')).map((f) => f.name.replace(/\.md$/, '')).sort().reverse();
      const results = [];
      const lowerQuery = (params.query || '').toLowerCase();
      for (const date of dates) {
        if (params.from_date && date < params.from_date) continue;
        if (params.to_date && date > params.to_date) continue;
        const content = await readStorageFile(`${userId}/logs/${date}.md`, env);
        if (!content) continue;
        for (const line of content.split('\n')) {
          if (line.toLowerCase().includes(lowerQuery)) {
            results.push(`[${date}] ${line.trim()}`);
          }
        }
      }
      return results.length === 0 ? `No matches found for "${params.query}".` : results.join('\n');
    }

    default:
      throw new Error(`Unknown profile tool: ${toolName}`);
  }
}

// ─── Composio REST API ────────────────────────────────────────────────────────

async function executeComposioTool(toolSlug, userId, args, env, page = 1) {
  console.log(`[composio] slug=${toolSlug} userId=${userId} args=${JSON.stringify(args).slice(0,200)}`);
  const res = await fetch(`https://backend.composio.dev/api/v3/tools/execute/${toolSlug}`, {
    method: 'POST',
    headers: {
      'x-api-key': env.COMPOSIO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId, arguments: args }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[composio] ERROR ${res.status}: ${errText.slice(0,300)}`);
    throw new Error(`Composio error (${res.status}): ${errText}`);
  }

  const raw = await res.json();
  const rawStr = JSON.stringify(raw);
  console.log(`[composio] response size=${rawStr.length} bytes`);
  return summarizeComposioResponse(toolSlug, raw, page);
}

// ─── Response summarization ──────────────────────────────────────────────────
// Composio returns full API payloads (HTML bodies, headers, etc.) that are far
// too large for a voice AI LLM. We distill them to concise summaries.

function summarizeComposioResponse(toolSlug, raw, page = 1) {
  try {
    const responseData = raw?.data?.response_data ?? raw?.response_data ?? raw;

    if (toolSlug.includes('LIST_MESSAGES') || toolSlug.includes('SEARCH_MESSAGES') || toolSlug.includes('FETCH_EMAILS')) {
      return summarizeEmailList(responseData, toolSlug, page);
    }

    // Outlook: get single message
    if (toolSlug.includes('GET_MESSAGE') || toolSlug.includes('FETCH_MESSAGE')) {
      return summarizeSingleEmail(responseData, toolSlug);
    }

    // Send / reply — just return status
    if (toolSlug.includes('SEND_EMAIL') || toolSlug.includes('REPLY')) {
      return summarizeSendResult(responseData, raw);
    }

    // Fallback: truncate to something reasonable
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    return text.length > 2000 ? text.slice(0, 2000) + '\n...(truncated)' : text;
  } catch (e) {
    console.error('summarize error:', e);
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return text.length > 2000 ? text.slice(0, 2000) + '\n...(truncated)' : text;
  }
}

function summarizeEmailList(data, toolSlug, page = 1) {
  let messages = data?.value ?? data?.messages ?? data;

  if (!Array.isArray(messages) && Array.isArray(data)) {
    messages = data;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return page > 1 ? 'No more emails.' : 'No emails found.';
  }

  // Already limited to 5 via $top, but cap just in case
  messages = messages.slice(0, 5);
  const offset = (page - 1) * 5;

  const lines = [];
  const idMap = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const num = offset + i + 1;
    const from = m.from?.emailAddress?.name
      ?? m.from?.emailAddress?.address
      ?? m.sender_email ?? m.from ?? 'Unknown';
    const subject = m.subject ?? '(no subject)';
    const date = m.receivedDateTime ?? m.sentDateTime ?? m.date ?? '';
    const shortDate = date ? formatShortDate(date) : '';
    const read = m.isRead === true ? '' : ' [NEW]';
    const id = m.id ?? m.messageId ?? '';

    let gist = cleanInvisible(m.bodyPreview ?? m.snippet ?? '');
    if (gist.length > 60) gist = gist.slice(0, 60) + '…';

    lines.push(`${num}. ${from} — ${subject}${read}${shortDate ? ` (${shortDate})` : ''}${gist ? ` | ${gist}` : ''}`);
    if (id) idMap.push(`${num}=${id}`);
  }

  const newCount = messages.filter(m => m.isRead === false).length;
  let header = page === 1
    ? `Showing ${messages.length} emails${newCount > 0 ? ` (${newCount} new)` : ''}:`
    : `Page ${page} (emails ${offset + 1}–${offset + messages.length}):`;

  let result = `${header}\n${lines.join('\n')}`;
  if (idMap.length > 0) {
    result += '\n\n' + compactIdMap(idMap);
  }
  return result;
}

function summarizeSingleEmail(data, toolSlug) {
  const m = data?.value?.[0] ?? data;

  const from = m.from?.emailAddress?.name
    ?? m.from?.emailAddress?.address
    ?? m.sender_email ?? m.from ?? 'Unknown';
  const to = (m.toRecipients ?? []).map(r => r.emailAddress?.name ?? r.emailAddress?.address).join(', ')
    || (m.to ?? '');
  const subject = m.subject ?? '(no subject)';
  const date = m.receivedDateTime ?? m.sentDateTime ?? m.date ?? '';
  const shortDate = date ? formatShortDate(date) : '';

  // Try bodyPreview first, fall back to stripped HTML body
  let body = cleanInvisible(m.bodyPreview ?? m.snippet ?? '');
  if (body.length < 20 && m.body?.content) {
    body = stripHtml(m.body.content);
  }
  body = cleanInvisible(body);
  if (body.length > 400) body = body.slice(0, 400) + '…';

  // No ID needed — the LLM already has it from when it called this tool
  return `From: ${from}\nTo: ${to}\nSubject: ${subject}\nDate: ${shortDate}\n\n${body}`;
}

function summarizeSendResult(data, raw) {
  const successful = raw?.successful ?? raw?.data?.successful;
  if (successful === true) {
    return 'Email sent successfully.';
  }
  const error = raw?.error ?? raw?.data?.error;
  if (error) return `Failed to send: ${typeof error === 'string' ? error : JSON.stringify(error)}`;
  return 'Email action completed.';
}

function compactIdMap(idPairs) {
  // idPairs: ["1=LONGID", "2=LONGID", ...]
  const parsed = idPairs.map(p => {
    const eq = p.indexOf('=');
    return { num: p.slice(0, eq), id: p.slice(eq + 1) };
  });

  if (parsed.length <= 1) {
    return `IDs: ${idPairs.join('|')}`;
  }

  // Find longest common prefix among all IDs
  const ids = parsed.map(p => p.id);
  let prefix = ids[0];
  for (let i = 1; i < ids.length; i++) {
    while (!ids[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  // Don't use a prefix shorter than 20 chars (not worth it)
  if (prefix.length < 20) {
    return `IDs: ${idPairs.join('|')}`;
  }

  const suffixes = parsed.map(p => `${p.num}=${p.id.slice(prefix.length)}`);
  return `ID_PRE=${prefix}\nIDs: ${suffixes.join('|')}`;
}

function formatShortDate(isoStr) {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return isoStr;
  }
}

function cleanInvisible(text) {
  return text
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u034F]/g, '')
    .replace(/\u00AD/g, '')
    .replace(/[\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/gi, '')
    .replace(/&#\d+;/g, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u034F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
