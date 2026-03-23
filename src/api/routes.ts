import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { Router, type Request, type Response } from 'express';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';
import * as imap from '../services/imap.js';
import * as memory from '../services/memory.js';
import * as smtp from '../services/smtp.js';
import * as web from '../services/web.js';

export const router = Router();

// ── Tool execution endpoint (for ConvAI client tools) ──

type ToolHandler = (params: Record<string, unknown>) => Promise<string>;

const toolHandlers: Record<string, ToolHandler> = {
  get_unread: async (p) => {
    const emails = await imap.getUnread(
      (p.folder as string) ?? 'INBOX',
      (p.limit as number) ?? 20,
    );
    if (emails.length === 0)
      return `No unread emails in ${p.folder ?? 'INBOX'}.`;
    return emails
      .map(
        (e) =>
          `[UID:${e.uid}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}`,
      )
      .join('\n');
  },

  get_email: async (p) => {
    const email = await imap.getEmail(
      p.email_uid as number,
      (p.folder as string) ?? 'INBOX',
    );
    const parts = [
      `From: ${email.from}`,
      `To: ${email.to}`,
      email.cc ? `CC: ${email.cc}` : null,
      `Subject: ${email.subject}`,
      `Date: ${email.date}`,
      `Message-ID: ${email.messageId}`,
      email.attachments.length > 0
        ? `Attachments: ${email.attachments.join(', ')}`
        : null,
      `\n--- Body ---\n`,
      email.text || '(no text content)',
      email.messageId
        ? `\n[To reply in the same thread, use send_email with reply_to_id="${email.messageId}"]`
        : null,
      email.listUnsubscribe
        ? `\n[Unsubscribe available — use unsubscribe tool with email_uid=${email.uid}]`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    return parts;
  },

  get_newsletters: async (p) => {
    const newsletters = await imap.getNewsletters(
      (p.limit as number) ?? 50,
      (p.folder as string) ?? 'Folders/Newsletters',
    );
    if (newsletters.length === 0) return 'No unread newsletters.';
    return newsletters
      .map(
        (n) =>
          `[UID:${n.uid}] From: ${n.from} | Subject: ${n.subject} | Date: ${n.date}`,
      )
      .join('\n');
  },

  get_sent: async (p) => {
    const emails = await imap.getSent(
      (p.limit as number) ?? 20,
      (p.folder as string) ?? 'Sent',
    );
    if (emails.length === 0) return 'No sent emails found.';
    return emails
      .map(
        (e) =>
          `[UID:${e.uid}] To: ${e.from} | Subject: ${e.subject} | Date: ${e.date}`,
      )
      .join('\n');
  },

  get_drafts: async (p) => {
    const emails = await imap.getDrafts(
      (p.limit as number) ?? 20,
      (p.folder as string) ?? 'Drafts',
    );
    if (emails.length === 0) return 'No drafts found.';
    return emails
      .map((e) => `[UID:${e.uid}] Subject: ${e.subject} | Date: ${e.date}`)
      .join('\n');
  },

  search_emails: async (p) => {
    const emails = await imap.searchEmails(
      {
        from: p.from as string | undefined,
        subject: p.subject as string | undefined,
        text: p.text as string | undefined,
        since: p.since as string | undefined,
        before: p.before as string | undefined,
      },
      (p.folder as string) ?? 'INBOX',
      (p.limit as number) ?? 20,
    );
    if (emails.length === 0) return 'No emails matched your search.';
    return emails
      .map(
        (e) =>
          `[UID:${e.uid}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}`,
      )
      .join('\n');
  },

  mark_read: async (p) => {
    const uids = p.email_uids as number[];
    await imap.markRead(uids, (p.folder as string) ?? 'INBOX');
    return `Marked ${uids.length} email(s) as read.`;
  },

  mark_unread: async (p) => {
    const uids = p.email_uids as number[];
    await imap.markUnread(uids, (p.folder as string) ?? 'INBOX');
    return `Marked ${uids.length} email(s) as unread.`;
  },

  delete_email: async (p) => {
    const uids = p.email_uids as number[];
    await imap.deleteEmail(
      uids,
      (p.folder as string) ?? 'INBOX',
      (p.permanent as boolean) ?? false,
    );
    const action = p.permanent ? 'Permanently deleted' : 'Moved to Trash';
    return `${action}: ${uids.length} email(s).`;
  },

  move_email: async (p) => {
    const uids = p.email_uids as number[];
    await imap.moveEmail(
      uids,
      p.target_folder as string,
      (p.folder as string) ?? 'INBOX',
    );
    return `Moved ${uids.length} email(s) to ${p.target_folder}.`;
  },

  send_email: async (p) => {
    const replyTo = p.reply_to_id as string | undefined;
    let subject = p.subject as string;
    if (replyTo && !subject.toLowerCase().startsWith('re:')) {
      subject = `Re: ${subject}`;
    }
    const messageId = await smtp.sendEmail({
      to: p.to as string,
      subject,
      body: p.body as string,
      cc: p.cc as string | undefined,
      bcc: p.bcc as string | undefined,
      inReplyTo: replyTo,
    });
    return `Email sent to ${p.to}${replyTo ? ' (in thread)' : ''}. Message ID: ${messageId}`;
  },

  read_profile: async () => {
    try {
      return await readFile(config.profilePath, 'utf-8');
    } catch {
      return 'Profile not found. It will be created when you teach me a preference.';
    }
  },

  update_profile: async (p) => {
    let current: string;
    try {
      current = await readFile(config.profilePath, 'utf-8');
    } catch {
      await mkdir(dirname(config.profilePath), { recursive: true });
      current = '';
    }
    const section = p.section as string;
    const content = p.content as string;
    const mode = (p.mode as string) ?? 'append';

    const heading = `## ${section}`;
    const idx = current.indexOf(heading);
    let updated: string;
    if (idx === -1) {
      updated = current.trimEnd() + `\n\n${heading}\n${content}\n`;
    } else {
      const start = idx + heading.length;
      const nextHeading = current.indexOf('\n## ', start);
      const newContent =
        mode === 'append'
          ? current
              .slice(start, nextHeading === -1 ? undefined : nextHeading)
              .trimEnd() +
            '\n' +
            content
          : '\n' + content;
      updated =
        nextHeading === -1
          ? current.slice(0, start) + newContent + '\n'
          : current.slice(0, start) +
            newContent +
            '\n' +
            current.slice(nextHeading);
    }
    await writeFile(config.profilePath, updated, 'utf-8');
    return `Updated "${section}" in profile.`;
  },

  log_interaction: async (p) => {
    const entry = `- [${new Date().toISOString()}] ${p.action} | ${p.context} | ${p.outcome}`;
    const handler = toolHandlers.update_profile;
    await handler({
      section: 'Learned Patterns',
      content: entry,
      mode: 'append',
    });
    return 'Logged interaction pattern.';
  },

  // ── New: Conversation memory tools ──

  get_conversation_log: async (p) => {
    const date = (p.date as string) ?? new Date().toISOString().slice(0, 10);
    return await memory.getLog(date);
  },

  save_conversation_note: async (p) => {
    await memory.saveNote(p.note as string);
    return "Note saved to today's conversation log.";
  },

  // ── New: Web reading tool ──

  read_url: async (p) => {
    const url = p.url as string;
    if (!url) return 'No URL provided.';
    try {
      return await web.readUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Failed to read URL: ${msg}`;
    }
  },

  unsubscribe: async (p) => {
    const uid = p.email_uid as number;
    const folder = (p.folder as string) ?? "INBOX";
    const email = await imap.getEmail(uid, folder);

    if (!email.listUnsubscribe) {
      return "This email does not have an unsubscribe header. You may need to look for an unsubscribe link in the email body.";
    }

    const raw = email.listUnsubscribe;
    const urlMatch = raw.match(/<(https?:\/\/[^>]+)>/);
    const mailtoMatch = raw.match(/<mailto:([^>]+)>/);

    const results: string[] = [];

    if (urlMatch) {
      try {
        const unsub = await fetch(urlMatch[1], {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(10000),
        });
        results.push(
          unsub.ok
            ? `Visited unsubscribe URL (HTTP ${unsub.status}) — likely unsubscribed.`
            : `Unsubscribe URL returned HTTP ${unsub.status}. May need manual action.`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`Failed to visit unsubscribe URL: ${msg}`);
      }
    }

    if (mailtoMatch && !urlMatch) {
      const mailto = mailtoMatch[1];
      const [address, queryStr] = mailto.split("?");
      let subject = "Unsubscribe";
      if (queryStr) {
        const params = new URLSearchParams(queryStr);
        subject = params.get("subject") || subject;
      }
      try {
        await smtp.sendEmail({
          to: address,
          subject,
          body: "Unsubscribe",
        });
        results.push(`Sent unsubscribe email to ${address}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`Failed to send unsubscribe email: ${msg}`);
      }
    }

    if (results.length === 0) {
      return `Found List-Unsubscribe header but couldn't parse it: ${raw}`;
    }

    return results.join("\n");
  },
};

router.post('/api/tools/:toolName', async (req: Request, res: Response) => {
  const toolName = req.params.toolName as string;
  const handler = toolHandlers[toolName as keyof typeof toolHandlers];
  if (!handler) {
    res.status(404).json({ error: `Unknown tool: ${toolName}` });
    return;
  }
  try {
    const result = await handler(req.body ?? {});
    res.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tool ${toolName} error:`, message);
    res.status(500).json({ error: message });
  }
});

// ── Conversation lifecycle ──

function buildSystemPrompt(conversationSummary: string): string {
  let prompt = `You are Mantri, a voice-first email assistant for ProtonMail. You help the user manage their inbox entirely by voice.

IMPORTANT: Do NOT speak first. Wait for the user to speak before responding. Never greet the user unprompted.

CORE BEHAVIOR:
- Start by silently reading the user's profile (read_profile) to understand preferences — do NOT announce this.
- Be concise and conversational — give GISTS, not full readouts.

EMAIL WALKTHROUGH (CRITICAL):
- When walking through emails (inbox or newsletters), present ONE email at a time.
- For each email say: subject and sender — in one sentence.
- Then STOP and WAIT for the user's instruction. Do NOT continue to the next email.
- The user will say one of: "next" / "skip", "tell me more" / "read it", "delete it", "mark as read", "reply", or any other action.
- Only after the user responds, move on to the next email.
- If user says "next" or "skip", move to the next email immediately.
- If user says "that's enough" or "stop", end the walkthrough.
- At the START of a walkthrough, tell the user the total count (e.g. "You have 12 unread emails. Here's the first one.") then present the first email and wait.

NEWSLETTERS:
- Same one-at-a-time rule applies.
- get_newsletters returns a SUMMARY LIST (sender + subject + date). It does NOT include body content.
- To read a newsletter's content, use get_email with the UID from the list.
- Walk through one at a time: announce the newsletter, then STOP and WAIT.
- When user says "read it" or "tell me more," call get_email for that UID and summarize the content conversationally.
- If user wants more on a specific link in the newsletter, use read_url to fetch and summarize it.

FETCHING EMAILS:
- When user says "read my emails" or "what's new," use get_unread.
- When user says "let's go through newsletters," use get_newsletters.

REPLYING TO EMAILS:
- ALWAYS use get_email first to get the Message-ID, then pass it as reply_to_id in send_email.
- Read back drafts before sending. Confirm with user.

MOVING EMAILS:
- When user says "move this to newsletters" or "this is a newsletter," use move_email to move it to "Folders/Newsletters".
- Common moves: Inbox → Folders/Newsletters, Inbox → Trash, etc.
- Confirm before moving.

UNSUBSCRIBING:
- When user says "unsubscribe from this" or "stop these emails," use the unsubscribe tool with the email UID.
- The tool handles List-Unsubscribe headers automatically (URL or mailto).
- If no unsubscribe header exists, tell the user and offer to search the email body for an unsubscribe link, then use read_url on it.
- Always confirm before unsubscribing.

LEARNING:
- When user teaches a preference, update their profile immediately with update_profile.
- Log patterns with log_interaction when you notice them.

CONVERSATION MEMORY:
- You have access to past conversation history. If user references something from before, use get_conversation_log with the relevant date.
- Use save_conversation_note to record important decisions or facts mid-conversation.

PERSONALITY:
- Friendly, efficient, slightly casual. Like a smart assistant who knows you well.
- Don't over-explain. Don't apologize excessively. Just help.`;

  if (conversationSummary && conversationSummary.trim()) {
    prompt +=
      '\n\nPREVIOUS CONVERSATION HISTORY (condensed):\n' + conversationSummary;
  }

  return prompt;
}

router.get('/api/session/start', async (_req: Request, res: Response) => {
  try {
    const summary = await memory.getSummary();
    const systemPrompt = buildSystemPrompt(summary);

    const client = new ElevenLabsClient({
      apiKey: config.elevenlabs.apiKey,
    });
    await client.conversationalAi.agents.update(config.elevenlabs.agentId, {
      conversationConfig: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
          firstMessage: '',
        },
      },
    });

    res.json({ agentId: config.elevenlabs.agentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Session start error:', message);
    res.status(500).json({ error: message });
  }
});

router.post('/api/conversation/end', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body as { transcript: string[] };
    if (!transcript || transcript.length === 0) {
      res.json({ result: 'No transcript to save.' });
      return;
    }
    await memory.appendLog(transcript);
    await memory.updateSummary(transcript);
    res.json({
      result: `Saved ${transcript.length} entries to conversation log.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Conversation end error:', message);
    res.status(500).json({ error: message });
  }
});
