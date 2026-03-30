import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";

const INITIAL_PROFILE = `# Mantri — User Profile

## Identity
- Name: 
- Email: 

## Priority Contacts

## Newsletter Preferences
- Subscribed: 
- Preferred sections: 
- Skip sections: 

## Noise Filters

## Communication Style
- Default tone: 
- Per-contact overrides: 

## Behavior Rules
- Always confirm before sending any email
- Always confirm before permanent deletion

## Learned Patterns
`;

async function ensureProfile(): Promise<string> {
  try {
    return await readFile(config.profilePath, "utf-8");
  } catch {
    await mkdir(dirname(config.profilePath), { recursive: true });
    await writeFile(config.profilePath, INITIAL_PROFILE, "utf-8");
    return INITIAL_PROFILE;
  }
}

function extractSection(
  content: string,
  section: string
): string | null {
  const heading = `## ${section}`;
  const idx = content.indexOf(heading);
  if (idx === -1) return null;

  const start = idx + heading.length;
  const nextHeading = content.indexOf("\n## ", start);
  const sectionContent =
    nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading);
  return sectionContent.trim();
}

function replaceSection(
  content: string,
  section: string,
  newContent: string,
  mode: "append" | "replace"
): string {
  const heading = `## ${section}`;
  const idx = content.indexOf(heading);

  if (idx === -1) {
    return content.trimEnd() + `\n\n${heading}\n${newContent}\n`;
  }

  const start = idx + heading.length;
  const nextHeading = content.indexOf("\n## ", start);
  const currentContent =
    nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading);

  let updated: string;
  if (mode === "append") {
    updated = currentContent.trimEnd() + "\n" + newContent;
  } else {
    updated = "\n" + newContent;
  }

  if (nextHeading === -1) {
    return content.slice(0, start) + updated + "\n";
  }
  return content.slice(0, start) + updated + "\n" + content.slice(nextHeading);
}

export function registerMemoryTools(server: McpServer): void {
  server.registerTool(
    "read_profile",
    {
      description:
        "Read the user's PROFILE.md which contains their preferences, priority contacts, newsletter preferences, noise filters, communication style, and learned patterns. Read this at the start of every conversation to personalize responses.",
      inputSchema: {
        section: z
          .string()
          .optional()
          .describe(
            'Specific section to read (e.g. "Priority Contacts", "Noise Filters"). Omit to read the full profile.'
          ),
      },
    },
    async ({ section }) => {
      try {
        const content = await ensureProfile();
        if (section) {
          const extracted = extractSection(content, section);
          if (extracted === null) {
            return {
              content: [
                {
                  type: "text",
                  text: `Section "${section}" not found in profile. Available sections can be seen by reading the full profile.`,
                },
              ],
            };
          }
          return {
            content: [
              { type: "text", text: `## ${section}\n${extracted}` },
            ],
          };
        }
        return { content: [{ type: "text", text: content }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading profile: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "update_profile",
    {
      description:
        "Update a section of the user's PROFILE.md. Use this when the user teaches you a preference (e.g. 'don't tell me about AmEx ads'), when you learn a new contact, or when a pattern emerges.",
      inputSchema: {
        section: z
          .string()
          .describe(
            'The profile section to update (e.g. "Noise Filters", "Priority Contacts", "Learned Patterns")'
          ),
        content: z.string().describe("The content to add or set"),
        mode: z
          .enum(["append", "replace"])
          .default("append")
          .describe(
            '"append" adds to existing section content, "replace" overwrites it (default: "append")'
          ),
      },
    },
    async ({ section, content: newContent, mode }) => {
      try {
        const current = await ensureProfile();
        const updated = replaceSection(current, section, newContent, mode);
        await writeFile(config.profilePath, updated, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `Updated "${section}" section in profile (${mode}).`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating profile: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "log_interaction",
    {
      description:
        "Log a user interaction pattern to the Learned Patterns section of the profile. Use this to record behaviors like: user always skips certain senders, user prefers concise replies, user reads newsletters about topic X.",
      inputSchema: {
        action: z
          .string()
          .describe('What happened (e.g. "skipped email", "replied")'),
        context: z
          .string()
          .describe(
            'Relevant context (e.g. "sender: newsletter@company.com")'
          ),
        outcome: z
          .string()
          .describe(
            'What to learn from this (e.g. "user not interested in this sender")'
          ),
      },
    },
    async ({ action, context, outcome }) => {
      try {
        const timestamp = new Date().toISOString();
        const entry = `- [${timestamp}] ${action} | ${context} | ${outcome}`;
        const current = await ensureProfile();
        const updated = replaceSection(
          current,
          "Learned Patterns",
          entry,
          "append"
        );
        await writeFile(config.profilePath, updated, "utf-8");
        return {
          content: [
            { type: "text", text: `Logged interaction pattern.` },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error logging interaction: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
