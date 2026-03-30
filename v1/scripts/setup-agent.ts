import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

// Load .env
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  if (line.startsWith("#") || !line.trim() || !line.includes("=")) continue;
  const eqIdx = line.indexOf("=");
  const key = line.slice(0, eqIdx).trim();
  const value = line.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY not found in .env");
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey });

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    getRL().question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function parseArgs(): { host?: string; guest?: string; chat?: string } {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host" && args[i + 1]) result.host = args[++i];
    else if (args[i] === "--guest" && args[i + 1]) result.guest = args[++i];
    else if (args[i] === "--chat" && args[i + 1]) result.chat = args[++i];
  }
  return result;
}

function appendEnv(key: string, value: string) {
  let content = readFileSync(envPath, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  writeFileSync(envPath, content, "utf-8");
}

async function main() {
  console.log("\n=== Mantri Agent Setup ===\n");

  // Step 1: List voices
  console.log("Fetching available voices...\n");
  const voicesRes = await client.voices.getAll({});
  const voices = (voicesRes as any).voices ?? [];
  const premade = voices.filter((v: any) => v.category === "premade").slice(0, 20);

  console.log("Available voices:");
  premade.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.voiceId})`);
  });

  // Step 2: Pick voices
  const cliArgs = parseArgs();
  let hostIdx: number, guestIdx: number, chatIdx: number;

  if (cliArgs.host && cliArgs.guest && cliArgs.chat) {
    hostIdx = parseInt(cliArgs.host, 10) - 1;
    guestIdx = parseInt(cliArgs.guest, 10) - 1;
    chatIdx = parseInt(cliArgs.chat, 10) - 1;
    console.log(`\nUsing CLI args: Host=#${cliArgs.host}, Guest=#${cliArgs.guest}, Chat=#${cliArgs.chat}`);
  } else {
    console.log("\nPick voices for the podcast (two hosts):\n");
    hostIdx = parseInt(await ask("Host voice number: "), 10) - 1;
    guestIdx = parseInt(await ask("Guest voice number: "), 10) - 1;
    chatIdx = parseInt(await ask("Chat agent voice number: "), 10) - 1;
  }

  const hostVoice = premade[hostIdx];
  const guestVoice = premade[guestIdx];
  const chatVoice = premade[chatIdx];

  if (!hostVoice || !guestVoice || !chatVoice) {
    console.error("Invalid voice selection.");
    process.exit(1);
  }

  console.log(
    `\nSelected: Host=${hostVoice.name}, Guest=${guestVoice.name}, Chat=${chatVoice.name}\n`
  );

  // Step 3: Create agent
  console.log("Creating ElevenLabs Conversational AI agent...\n");

  const systemPrompt = `You are Mantri, a voice-first email assistant for ProtonMail. You help the user manage their inbox entirely by voice.

CORE BEHAVIOR:
- Always start by reading the user's profile (read_profile tool) to understand their preferences.
- Be concise and conversational. You're a helpful assistant, not a robot.
- Give GISTS, not full readouts. When listing emails, give one-line summaries: sender + subject + when. Never dump raw metadata.
- Only read full email details when the user asks to "tell me more" or "read that email".
- For emails with images (like USPS Informed Delivery), describe what's in them if relevant.

ACTIONS:
- Always read back email drafts before sending. Ask for confirmation.
- Always confirm before deleting emails.
- When the user teaches you a preference ("stop telling me about AmEx ads"), update their profile immediately using update_profile.
- Log interaction patterns when you notice them (user repeatedly skips certain senders, etc.).

PERSONALITY:
- Friendly, efficient, slightly casual. Like a smart assistant who knows you well.
- Don't over-explain. Don't apologize excessively. Just help.`;

  const toolDefinitions = [
    {
      type: "client" as const,
      name: "get_unread",
      description:
        "Get unread emails from a folder. Returns sender, subject, date for each.",
      parameters: {
        type: "object" as const,
        properties: {
          folder: {
            type: "string",
            description: 'Mailbox folder (default: "INBOX")',
          },
          limit: {
            type: "number",
            description: "Max number of emails to return (default: 20)",
          },
        },
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "get_email",
      description:
        "Get full content of a specific email by UID. Use when user wants more details.",
      parameters: {
        type: "object" as const,
        properties: {
          email_uid: {
            type: "number",
            description: "The UID of the email",
          },
          folder: {
            type: "string",
            description: 'Mailbox folder (default: "INBOX")',
          },
        },
        required: ["email_uid"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "get_newsletters",
      description:
        "Get unread newsletters with full content from the Newsletters folder.",
      parameters: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Max newsletters to return (default: 50)",
          },
        },
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "search_emails",
      description:
        "Search emails by sender, subject, body text, or date range.",
      parameters: {
        type: "object" as const,
        properties: {
          from: { type: "string", description: "Filter by sender" },
          subject: { type: "string", description: "Filter by subject" },
          text: { type: "string", description: "Search body text" },
          folder: {
            type: "string",
            description: 'Folder to search (default: "INBOX")',
          },
          since: {
            type: "string",
            description: "Emails after this date (ISO 8601)",
          },
          before: {
            type: "string",
            description: "Emails before this date (ISO 8601)",
          },
        },
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "mark_read",
      description: "Mark emails as read.",
      parameters: {
        type: "object" as const,
        properties: {
          email_uids: {
            type: "array",
            items: { type: "number" },
            description: "Array of email UIDs",
          },
          folder: { type: "string", description: "Mailbox folder" },
        },
        required: ["email_uids"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "mark_unread",
      description: "Mark emails as unread.",
      parameters: {
        type: "object" as const,
        properties: {
          email_uids: {
            type: "array",
            items: { type: "number" },
            description: "Array of email UIDs",
          },
          folder: { type: "string", description: "Mailbox folder" },
        },
        required: ["email_uids"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "delete_email",
      description:
        "Delete emails. Moves to Trash by default. Always confirm with user first.",
      parameters: {
        type: "object" as const,
        properties: {
          email_uids: {
            type: "array",
            items: { type: "number" },
            description: "Array of email UIDs",
          },
          folder: { type: "string", description: "Mailbox folder" },
          permanent: {
            type: "boolean",
            description: "If true, permanently delete",
          },
        },
        required: ["email_uids"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "move_email",
      description: "Move emails to a different folder.",
      parameters: {
        type: "object" as const,
        properties: {
          email_uids: {
            type: "array",
            items: { type: "number" },
            description: "Array of email UIDs",
          },
          target_folder: {
            type: "string",
            description: "Destination folder",
          },
          folder: { type: "string", description: "Source folder" },
        },
        required: ["email_uids", "target_folder"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "send_email",
      description:
        "Send an email or reply. Always read back the draft and get confirmation first.",
      parameters: {
        type: "object" as const,
        properties: {
          to: { type: "string", description: "Recipient(s)" },
          subject: { type: "string", description: "Subject line" },
          body: { type: "string", description: "Email body" },
          cc: { type: "string", description: "CC recipients" },
          bcc: { type: "string", description: "BCC recipients" },
          reply_to_id: {
            type: "string",
            description: "Message-ID for threading replies",
          },
        },
        required: ["to", "subject", "body"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "read_profile",
      description:
        "Read the user's preference profile. Call this at the start of every conversation.",
      parameters: {
        type: "object" as const,
        properties: {
          section: {
            type: "string",
            description: "Specific section to read, or omit for full profile",
          },
        },
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "update_profile",
      description:
        "Update user preferences. Use when user teaches you something.",
      parameters: {
        type: "object" as const,
        properties: {
          section: {
            type: "string",
            description: 'Profile section (e.g. "Noise Filters")',
          },
          content: { type: "string", description: "Content to add or set" },
          mode: {
            type: "string",
            description: '"append" or "replace"',
          },
        },
        required: ["section", "content"],
      },
      expects_response: true,
    },
    {
      type: "client" as const,
      name: "log_interaction",
      description: "Log a user behavior pattern for learning.",
      parameters: {
        type: "object" as const,
        properties: {
          action: { type: "string", description: "What happened" },
          context: { type: "string", description: "Relevant context" },
          outcome: { type: "string", description: "What to learn" },
        },
        required: ["action", "context", "outcome"],
      },
      expects_response: true,
    },
  ];

  const agentResponse = await client.conversationalAi.agents.create({
    conversationConfig: {
      agent: {
        prompt: {
          prompt: systemPrompt,
        },
        firstMessage:
          "Hey! I'm Mantri, your email assistant. What would you like to know about your inbox?",
        language: "en",
      },
      tts: {
        voiceId: chatVoice.voiceId,
      },
    },
    name: "Mantri",
    tools: toolDefinitions as any,
  });

  const agentId = (agentResponse as any).agentId ?? (agentResponse as any).agent_id;
  console.log(`Agent created! ID: ${agentId}\n`);

  // Step 4: Save to .env
  appendEnv("ELEVENLABS_AGENT_ID", agentId);
  appendEnv("ELEVENLABS_HOST_VOICE_ID", hostVoice.voiceId);
  appendEnv("ELEVENLABS_GUEST_VOICE_ID", guestVoice.voiceId);

  console.log("Saved to .env:");
  console.log(`  ELEVENLABS_AGENT_ID=${agentId}`);
  console.log(`  ELEVENLABS_HOST_VOICE_ID=${hostVoice.voiceId}`);
  console.log(`  ELEVENLABS_GUEST_VOICE_ID=${guestVoice.voiceId}`);
  console.log("\nSetup complete! Run: npm run serve");
  rl?.close();
}

main().catch((err) => {
  console.error("Setup failed:", err);
  rl?.close();
  process.exit(1);
});
