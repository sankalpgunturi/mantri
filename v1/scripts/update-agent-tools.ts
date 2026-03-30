import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("#") || !line.trim() || !line.includes("=")) continue;
  const eqIdx = line.indexOf("=");
  const key = line.slice(0, eqIdx).trim();
  const value = line.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY!,
});

const tools: any[] = [
  {
    type: "client",
    name: "get_unread",
    description:
      "Get unread emails from a folder. Returns sender, subject, date for each.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: 'Mailbox folder (default: "INBOX")' },
        limit: { type: "number", description: "Max emails to return (default: 20)" },
      },
    },
  },
  {
    type: "client",
    name: "get_email",
    description:
      "Get full content of a specific email by UID. Returns Message-ID needed for threading replies.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        email_uid: { type: "number", description: "The UID of the email" },
        folder: { type: "string", description: 'Mailbox folder (default: "INBOX")' },
      },
      required: ["email_uid"],
    },
  },
  {
    type: "client",
    name: "get_newsletters",
    description:
      "Get unread newsletters with full content from the Newsletters folder.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max newsletters (default: 50)" },
        folder: {
          type: "string",
          description: 'Newsletter folder (default: "Folders/Newsletters")',
        },
      },
    },
  },
  {
    type: "client",
    name: "get_sent",
    description: "Get recent sent emails. Use to check what was already sent or find threads.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max emails (default: 20)" },
        folder: { type: "string", description: "Sent folder name (default: Sent)" },
      },
    },
  },
  {
    type: "client",
    name: "get_drafts",
    description: "Get draft emails that have not been sent yet.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max drafts (default: 20)" },
        folder: { type: "string", description: "Drafts folder name (default: Drafts)" },
      },
    },
  },
  {
    type: "client",
    name: "search_emails",
    description: "Search emails by sender, subject, body text, or date range.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Filter by sender" },
        subject: { type: "string", description: "Filter by subject" },
        text: { type: "string", description: "Search body text" },
        folder: { type: "string", description: 'Folder (default: "INBOX")' },
        since: { type: "string", description: "After date (ISO 8601)" },
        before: { type: "string", description: "Before date (ISO 8601)" },
      },
    },
  },
  {
    type: "client",
    name: "mark_read",
    description: "Mark emails as read.",
    expectsResponse: true,
    responseTimeoutSecs: 15,
    parameters: {
      type: "object",
      properties: {
        email_uids: {
          type: "array",
          items: { type: "number", description: "A UID" },
          description: "Email UIDs",
        },
        folder: { type: "string", description: "Mailbox folder" },
      },
      required: ["email_uids"],
    },
  },
  {
    type: "client",
    name: "mark_unread",
    description: "Mark emails as unread.",
    expectsResponse: true,
    responseTimeoutSecs: 15,
    parameters: {
      type: "object",
      properties: {
        email_uids: {
          type: "array",
          items: { type: "number", description: "A UID" },
          description: "Email UIDs",
        },
        folder: { type: "string", description: "Mailbox folder" },
      },
      required: ["email_uids"],
    },
  },
  {
    type: "client",
    name: "delete_email",
    description:
      "Delete emails. Moves to Trash by default. Always confirm with user first.",
    expectsResponse: true,
    responseTimeoutSecs: 15,
    parameters: {
      type: "object",
      properties: {
        email_uids: {
          type: "array",
          items: { type: "number", description: "A UID" },
          description: "Email UIDs",
        },
        folder: { type: "string", description: "Mailbox folder" },
        permanent: { type: "boolean", description: "Permanently delete" },
      },
      required: ["email_uids"],
    },
  },
  {
    type: "client",
    name: "move_email",
    description: "Move emails to a different folder.",
    expectsResponse: true,
    responseTimeoutSecs: 15,
    parameters: {
      type: "object",
      properties: {
        email_uids: {
          type: "array",
          items: { type: "number", description: "A UID" },
          description: "Email UIDs",
        },
        target_folder: { type: "string", description: "Destination folder" },
        folder: { type: "string", description: "Source folder" },
      },
      required: ["email_uids", "target_folder"],
    },
  },
  {
    type: "client",
    name: "send_email",
    description:
      "Send an email or reply. IMPORTANT: To reply in a thread, first use get_email to get the Message-ID, then pass it as reply_to_id. Always read back draft and confirm before sending.",
    expectsResponse: true,
    responseTimeoutSecs: 30,
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient(s)" },
        subject: { type: "string", description: "Subject" },
        body: { type: "string", description: "Body" },
        cc: { type: "string", description: "CC" },
        bcc: { type: "string", description: "BCC" },
        reply_to_id: {
          type: "string",
          description:
            "Message-ID from get_email to reply in same thread. MUST be set when replying.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    type: "client",
    name: "read_profile",
    description:
      "Read user preference profile. Call at start of every conversation.",
    expectsResponse: true,
    responseTimeoutSecs: 10,
    parameters: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "Section to read, or omit for full profile",
        },
      },
    },
  },
  {
    type: "client",
    name: "update_profile",
    description: "Update user preferences when user teaches you something.",
    expectsResponse: true,
    responseTimeoutSecs: 10,
    parameters: {
      type: "object",
      properties: {
        section: { type: "string", description: "Profile section" },
        content: { type: "string", description: "Content to add" },
        mode: { type: "string", description: "append or replace" },
      },
      required: ["section", "content"],
    },
  },
  {
    type: "client",
    name: "log_interaction",
    description: "Log a user behavior pattern for learning.",
    expectsResponse: true,
    responseTimeoutSecs: 10,
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "What happened" },
        context: { type: "string", description: "Context" },
        outcome: { type: "string", description: "What to learn" },
      },
      required: ["action", "context", "outcome"],
    },
  },
  // ── New conversation memory + web tools ──
  {
    type: "client",
    name: "get_conversation_log",
    description:
      "Retrieve a past conversation log by date. Use when user references something from a previous day.",
    expectsResponse: true,
    responseTimeoutSecs: 10,
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Date in YYYY-MM-DD format. Defaults to today if not provided.",
        },
      },
    },
  },
  {
    type: "client",
    name: "save_conversation_note",
    description:
      "Save an important fact or decision to today's conversation log for future reference.",
    expectsResponse: true,
    responseTimeoutSecs: 10,
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "The note to save" },
      },
      required: ["note"],
    },
  },
  {
    type: "client",
    name: "read_url",
    description:
      "Fetch and read a web page. Use when user asks to 'tell me more' about a link in a newsletter or email.",
    expectsResponse: true,
    responseTimeoutSecs: 15,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to read" },
      },
      required: ["url"],
    },
  },
  {
    type: "client",
    name: "unsubscribe",
    description:
      "Unsubscribe from a mailing list. Reads the List-Unsubscribe header and visits the unsubscribe URL or sends the unsubscribe email. Always confirm with the user before executing.",
    expectsResponse: true,
    responseTimeoutSecs: 15,
    parameters: {
      type: "object",
      properties: {
        email_uid: {
          type: "number",
          description: "The UID of the email to unsubscribe from",
        },
        folder: {
          type: "string",
          description: 'Mailbox folder (default: "INBOX")',
        },
      },
      required: ["email_uid"],
    },
  },
];

async function main() {
  const agentId = process.env.ELEVENLABS_AGENT_ID!;
  console.log(`Updating agent ${agentId} with ${tools.length} client tools...`);

  await client.conversationalAi.agents.update(agentId, {
    conversationConfig: {
      agent: {
        prompt: {
          tools: tools,
        },
      },
    },
  });

  const agent = await client.conversationalAi.agents.get(agentId, {});
  const savedTools =
    (agent as any).conversation_config?.agent?.prompt?.tools ?? [];
  console.log(`\nAgent now has ${savedTools.length} tools:`);
  for (const t of savedTools) {
    console.log(
      `  - ${t.name} (type: ${t.type}, expects_response: ${t.expects_response})`
    );
  }
  console.log("\nDone! Restart the chat to use the updated tools.");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
