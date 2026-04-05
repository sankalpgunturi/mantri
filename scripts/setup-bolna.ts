/**
 * One-time setup script for Bolna Voice AI (outbound mode).
 *
 * Creates a Bolna agent configured for outbound calls.
 * The frontend triggers calls via POST /api/call, and Bolna
 * calls the user's registered phone number.
 *
 * Prerequisites:
 *   - BOLNA_API_KEY set in .env
 *   - BOLNA_BRIDGE_SECRET set in .env
 *   - BOLNA_CALLBACK_URL set in .env (Cloudflare Worker URL)
 *   - Providers (Deepgram, Cartesia, OpenRouter) connected in Bolna dashboard
 *
 * Usage: npx tsx scripts/setup-bolna.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env')

// ─── Load .env ────────────────────────────────────────────────────────────────

const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  if (line.startsWith('#') || !line.trim() || !line.includes('=')) continue
  const eqIdx = line.indexOf('=')
  const key = line.slice(0, eqIdx).trim()
  const value = line.slice(eqIdx + 1).trim()
  if (!process.env[key]) process.env[key] = value
}

const BOLNA_API_KEY = process.env.BOLNA_API_KEY
const BOLNA_BRIDGE_SECRET = process.env.BOLNA_BRIDGE_SECRET
const BOLNA_CALLBACK_URL = process.env.BOLNA_CALLBACK_URL

if (!BOLNA_API_KEY) { console.error('BOLNA_API_KEY not set in .env'); process.exit(1) }
if (!BOLNA_BRIDGE_SECRET) { console.error('BOLNA_BRIDGE_SECRET not set in .env'); process.exit(1) }
if (!BOLNA_CALLBACK_URL) { console.error('BOLNA_CALLBACK_URL not set in .env'); process.exit(1) }

const API_BASE = 'https://api.bolna.ai'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function bolnaFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${BOLNA_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Bolna API ${options.method ?? 'GET'} ${path} failed (${res.status}): ${body}`)
  }
  return res.json()
}

function appendEnv(key: string, value: string) {
  let content = readFileSync(envPath, 'utf-8')
  const regex = new RegExp(`^${key}=.*$`, 'm')
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`)
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`
  }
  writeFileSync(envPath, content, 'utf-8')
}

// ─── System prompt ────────────────────────────────────────────────────────────
// {profile_content} and {user_id} are injected via user_data when placing the call.

const SYSTEM_PROMPT = `You are Mantri, a voice-powered personal email assistant. You help {user_name} manage their inbox entirely by voice.

## Context
Profile and preferences:
{profile_content}

Internal user ID: {user_id}
CRITICAL: When calling ANY tool, you MUST pass user_id as "{user_id}".

## Opening the Call
Greet the user warmly by name: "Hey {user_name}! I'm Mantri, your email assistant. Want me to check what emails you've got?"
Then WAIT for the user to respond. Do NOT auto-check the inbox. The user might want to do something else first — like search for a specific email, compose something, or ask a question.

## Checking Inbox (when user says yes)
1. Call check_inbox
2. Tell them the count: "You've got X emails, Y of them are new. Want me to go through them?"
3. Wait for confirmation

## Walking Through Emails — One at a Time
Present ONE email at a time in this format:
  "There's an email from [sender] — [subject]."
Then STOP and wait for the user.

The user can say:
- "Read it" or "What's it about?" → Give a ONE-SENTENCE gist of the email using the preview/gist data. Do NOT read the entire email word for word.
- "More details" or "Tell me more" → NOW read the full content in more detail.
- "Next" → Mark the current email as read, move to the next one.
- "Delete it" → Confirm first ("Delete the email from [sender]?"), then delete.
- "Archive it" or "Skip" → Mark as read, move on.
- "Reply" → Start the reply flow (see below).

After the user is done with one email, move to the next. Do not rush through the list.

## Reading Emails — Gist First
When the user asks to read an email:
- First give a one-sentence gist: what the email is about, the key point.
- Only expand to the full content if the user asks for "more details" or "the full thing".
- Never dump raw metadata, headers, or HTML. Speak naturally.

## Replying to Emails
When the user wants to reply:
1. ALWAYS reply in the thread (use reply_to_email with the message_id). Never send a separate email to the person.
2. Let the user dictate the reply.
3. Read back the draft: "Here's what I'll send: [draft]. Sound good?"
4. Let the user iterate: "Change the second sentence to..." or "Make it more formal"
5. Only send when the user explicitly confirms: "Send it" / "Yes" / "Go ahead"

## Composing New Emails
1. Ask for recipient, subject, and content (can be collected conversationally).
2. Draft it, read it back.
3. Let the user refine it.
4. Send only on explicit confirmation.

## Searching Emails
When the user asks to find something ("Did I get an email from Ben?"):
1. Ask a clarifying question if helpful: "Do you want me to look at recent emails or go further back?"
2. Call search_emails
3. Report results: "I found 3 emails from Ben. Want me to go through them?"
4. Then walk through results one at a time, same as inbox.

## Templates
The user can create and use email templates:
- "Save this as a template called [name]" → use save_template
- "Send the rejection template to [person]" → fetch the template with get_template, fill in details, send

## Learning & Profile Updates
When the user teaches you a preference or you notice a pattern:
- Update their profile SILENTLY using update_profile. Do NOT say "I'm making a tool call" or mention technical details.
- Confirm naturally: "Got it, I'll remember that John is a priority contact. Next time he emails you, I'll flag it right away."
- Examples of things to learn:
  - "John is important" → update Priority Contacts
  - "Stop telling me about newsletters from X" → update Noise Filters
  - "I prefer casual tone with friends" → update Communication Style
  - "Always skip privacy policy emails" → update Behavior Rules

## Behavior Rules (from profile)
Follow ALL rules in the user's profile exactly. For example, if the profile says to skip certain senders or auto-mark certain emails as read, do so without mentioning those emails.

## Personality
- Friendly, efficient, slightly casual. Like a smart assistant who knows you well.
- Be CONCISE. This is a phone call, not an essay. Short sentences.
- Don't over-explain. Don't apologize excessively. Just help.
- Never mention tool names, API calls, or technical internals. Speak like a human assistant.
- Use natural phrasing: "Let me check..." not "I am now executing check_inbox..."
`

// ─── Custom function schemas ──────────────────────────────────────────────────

const CALLBACK = BOLNA_CALLBACK_URL
const TOKEN = `Bearer ${BOLNA_BRIDGE_SECRET}`

function customFunction(
  name: string,
  description: string,
  preCallMessage: string,
  parameters: Record<string, unknown>,
  required: string[],
  method: 'GET' | 'POST' = 'POST'
) {
  const allProps: Record<string, unknown> = {
    user_id: { type: 'string', description: 'The user ID — always pass "{user_id}"' },
    ...parameters,
  }
  const allRequired = ['user_id', ...required]

  const paramMapping: Record<string, string> = {}
  for (const key of Object.keys(allProps)) {
    paramMapping[key] = `%(${key})s`
  }

  return {
    name,
    description,
    pre_call_message: preCallMessage,
    parameters: {
      type: 'object',
      properties: allProps,
      required: allRequired,
    },
    key: 'custom_task',
    value: {
      method,
      param: paramMapping,
      url: `${CALLBACK}/api/bolna/tools/${name}`,
      api_token: TOKEN,
      headers: { 'Content-Type': 'application/json' },
    },
  }
}

const CUSTOM_FUNCTIONS = [
  // ── Email tools ──
  customFunction(
    'check_inbox',
    'Check the inbox. Returns 5 emails at a time. Use page=1 for first 5, page=2 for next 5, etc. When user says "next" or "more", increment the page.',
    'Let me check...',
    {
      page: { type: 'integer', description: 'Page number, starting at 1. Default 1.' },
    },
    []
  ),
  customFunction(
    'read_email',
    'Use this function when the user wants to read the full content of a specific email. They must specify which email (by ID, sender, or subject).',
    'Let me pull up that email...',
    {
      message_id: { type: 'string', description: 'The ID of the email message to read' },
    },
    ['message_id']
  ),
  customFunction(
    'search_emails',
    'Search emails by sender, subject, or keyword. Returns 5 results at a time. Use page=1 for first 5, page=2 for next 5, etc.',
    'Searching...',
    {
      query: { type: 'string', description: 'Search query — sender name, subject, or keywords' },
      page: { type: 'integer', description: 'Page number, starting at 1. Default 1.' },
    },
    ['query']
  ),
  customFunction(
    'send_email',
    'Use this function to send a new email. ALWAYS read back the draft to the user and get explicit confirmation before sending. Collect recipient, subject, and body from the conversation.',
    'Preparing to send that email...',
    {
      to: { type: 'string', description: 'Recipient email address' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Email body content' },
      cc: { type: 'string', description: 'CC recipients (optional)' },
    },
    ['to', 'subject', 'body']
  ),
  customFunction(
    'reply_to_email',
    'Use this function to reply to an existing email. ALWAYS read back the reply draft and get explicit confirmation before sending.',
    'Drafting your reply...',
    {
      message_id: { type: 'string', description: 'The ID of the email to reply to' },
      body: { type: 'string', description: 'The reply message body' },
    },
    ['message_id', 'body']
  ),

  // ── Profile / memory tools ──
  customFunction(
    'read_profile',
    "Use this function to read the user's profile and preferences. Call this at the start of conversations or when you need to check their preferences.",
    'Checking your preferences...',
    {
      section: { type: 'string', description: 'Specific section to read (e.g. "Email Preferences"), or omit for the full profile' },
    },
    []
  ),
  customFunction(
    'update_profile',
    "Use this function when the user teaches you a new preference, adds a priority contact, or changes a setting. Updates a specific section of their profile. Do NOT announce this to the user — update silently.",
    '',
    {
      section: { type: 'string', description: 'Profile section to update (e.g. "Priority Contacts", "Email Preferences")' },
      content: { type: 'string', description: 'The content to add or set in that section' },
      mode: { type: 'string', description: '"append" to add to existing content, or "replace" to overwrite the section. Default: "append"' },
    },
    ['section', 'content']
  ),
  customFunction(
    'save_conversation_note',
    'Use this function to save an important note from the conversation for future reference. Use when the user mentions something worth remembering.',
    'Noted.',
    {
      note: { type: 'string', description: 'The note to save' },
    },
    ['note']
  ),
  customFunction(
    'search_conversation_logs',
    'Use this function to search through past conversation history when the user asks about previous interactions or past topics.',
    'Searching your conversation history...',
    {
      query: { type: 'string', description: 'Search query to find in past conversations' },
    },
    ['query']
  ),
  customFunction(
    'log_interaction',
    'Use this function to log a user behavior pattern that Mantri should learn from. For example, if the user repeatedly ignores emails from a certain sender.',
    '',
    {
      entry: { type: 'string', description: 'Description of the pattern to learn' },
    },
    ['entry']
  ),
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Mantri — Bolna Voice Agent Setup (Outbound) ===\n')

  console.log('Creating Bolna agent...\n')

  const agentPayload = {
    agent_config: {
      agent_name: 'Mantri',
      agent_welcome_message: "Hey {user_name}! I'm Mantri, your email assistant. Want me to check what emails you've got?",
      agent_type: 'other',
      tasks: [
        {
          task_type: 'conversation',
          tools_config: {
            llm_agent: {
              agent_type: 'simple_llm_agent',
              agent_flow_type: 'streaming',
              llm_config: {
                provider: 'openrouter',
                family: 'openai',
                model: 'openai/gpt-4o-mini',
                max_tokens: 500,
                temperature: 0.3,
                top_p: 0.9,
              },
            },
            transcriber: {
              provider: 'deepgram',
              model: 'nova-3',
              language: 'en',
              stream: true,
              endpointing: 250,
            },
            synthesizer: {
              provider: 'cartesia',
              provider_config: {
                voice: 'Vikram ',
                voice_id: '38bded0a-3ab4-42d1-8e47-2e0b6b10ced9',
                model: 'sonic-3',
                language: 'en',
              },
              stream: true,
              buffer_size: 150,
            },
            input: { provider: 'twilio', format: 'wav' },
            output: { provider: 'twilio', format: 'wav' },
            api_tools: {
              tools: CUSTOM_FUNCTIONS,
              tools_params: Object.fromEntries(
                CUSTOM_FUNCTIONS.map((fn) => [fn.name, fn.value])
              ),
            },
          },
          toolchain: {
            execution: 'parallel',
            pipelines: [['transcriber', 'llm', 'synthesizer']],
          },
          task_config: {
            hangup_after_silence: 30,
            call_terminate: 600,
            number_of_words_for_interruption: 2,
            backchanneling: true,
            backchanneling_message_gap: 5,
          },
        },
      ],
    },
    agent_prompts: {
      task_1: {
        system_prompt: SYSTEM_PROMPT,
      },
    },
  }

  const agentResult = await bolnaFetch('/v2/agent', {
    method: 'POST',
    body: JSON.stringify(agentPayload),
  })

  const agentId = agentResult.agent_id
  console.log(`Agent created: ${agentId}\n`)

  appendEnv('BOLNA_AGENT_ID', agentId)

  console.log('Saved to .env:')
  console.log(`  BOLNA_AGENT_ID=${agentId}`)
  console.log('\nSetup complete!')
  console.log('The agent works via outbound calls — no phone number purchase needed.')
  console.log('Users click "Call me" in the frontend, and Bolna calls them using its default numbers.')
}

main().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
