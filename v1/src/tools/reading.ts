import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as imap from "../services/imap.js";

export function registerReadingTools(server: McpServer): void {
  server.registerTool(
    "get_unread",
    {
      description:
        "Get unread emails from a folder. Returns a concise summary of each: sender, subject, date. Use this when the user asks about their unread emails or what's new in their inbox.",
      inputSchema: {
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Mailbox folder (default: "INBOX")'),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Max number of emails to return (default: 20)"),
      },
    },
    async ({ folder, limit }) => {
      try {
        const emails = await imap.getUnread(folder, limit);
        if (emails.length === 0) {
          return {
            content: [
              { type: "text", text: `No unread emails in ${folder}.` },
            ],
          };
        }
        const summary = emails
          .map(
            (e) =>
              `[UID:${e.uid}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}`
          )
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `${emails.length} unread email(s) in ${folder}:\n\n${summary}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching unread emails: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_email",
    {
      description:
        "Get the full content of a specific email by its UID. Use this when the user wants to read more details about a particular email.",
      inputSchema: {
        email_uid: z.number().describe("The UID of the email to retrieve"),
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Mailbox folder (default: "INBOX")'),
      },
    },
    async ({ email_uid, folder }) => {
      try {
        const email = await imap.getEmail(email_uid, folder);
        const parts = [
          `From: ${email.from}`,
          `To: ${email.to}`,
          email.cc ? `CC: ${email.cc}` : null,
          `Subject: ${email.subject}`,
          `Date: ${email.date}`,
          `Message-ID: ${email.messageId}`,
          email.attachments.length > 0
            ? `Attachments: ${email.attachments.join(", ")}`
            : null,
          `\n--- Body ---\n`,
          email.text || "(no text content)",
        ].filter(Boolean);

        return {
          content: [{ type: "text", text: parts.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_newsletters",
    {
      description:
        "Get unread newsletters with their full content. Fetches from the Newsletters folder. Use this for generating podcast digests or when the user asks about their newsletters.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .default(50)
          .describe("Max number of newsletters to return (default: 50)"),
        folder: z
          .string()
          .optional()
          .default("Folders/Newsletters")
          .describe('Newsletter folder path (default: "Folders/Newsletters")'),
      },
    },
    async ({ limit, folder }) => {
      try {
        const newsletters = await imap.getNewsletters(limit, folder);
        if (newsletters.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No unread newsletters in ${folder}.`,
              },
            ],
          };
        }

        const formatted = newsletters
          .map(
            (n) =>
              `[UID:${n.uid}] From: ${n.from} | Subject: ${n.subject} | Date: ${n.date}`
          )
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text: `${newsletters.length} unread newsletter(s) in ${folder}:\n\n${formatted}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching newsletters: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "search_emails",
    {
      description:
        "Search emails by sender, subject, body text, or date range. Use this when the user asks to find a specific email.",
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe("Filter by sender email or name"),
        subject: z
          .string()
          .optional()
          .describe("Filter by subject keywords"),
        text: z
          .string()
          .optional()
          .describe("Search in email body text"),
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Mailbox folder to search (default: "INBOX")'),
        since: z
          .string()
          .optional()
          .describe("Emails after this date (ISO 8601, e.g. 2026-03-01)"),
        before: z
          .string()
          .optional()
          .describe("Emails before this date (ISO 8601, e.g. 2026-03-23)"),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Max results (default: 20)"),
      },
    },
    async ({ from, subject, text, folder, since, before, limit }) => {
      try {
        const emails = await imap.searchEmails(
          { from, subject, text, since, before },
          folder,
          limit
        );
        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: "No emails matched your search." }],
          };
        }
        const summary = emails
          .map(
            (e) =>
              `[UID:${e.uid}] From: ${e.from} | Subject: ${e.subject} | Date: ${e.date}`
          )
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `${emails.length} result(s):\n\n${summary}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching emails: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
