import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as imap from "../services/imap.js";
import * as smtp from "../services/smtp.js";

export function registerActionTools(server: McpServer): void {
  server.registerTool(
    "mark_read",
    {
      description:
        "Mark one or more emails as read. Use after the user has reviewed an email or batch of emails.",
      inputSchema: {
        email_uids: z
          .array(z.number())
          .describe("Array of email UIDs to mark as read"),
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Mailbox folder (default: "INBOX")'),
      },
    },
    async ({ email_uids, folder }) => {
      try {
        await imap.markRead(email_uids, folder);
        return {
          content: [
            {
              type: "text",
              text: `Marked ${email_uids.length} email(s) as read in ${folder}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error marking as read: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "mark_unread",
    {
      description: "Mark one or more emails as unread.",
      inputSchema: {
        email_uids: z
          .array(z.number())
          .describe("Array of email UIDs to mark as unread"),
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Mailbox folder (default: "INBOX")'),
      },
    },
    async ({ email_uids, folder }) => {
      try {
        await imap.markUnread(email_uids, folder);
        return {
          content: [
            {
              type: "text",
              text: `Marked ${email_uids.length} email(s) as unread in ${folder}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error marking as unread: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "delete_email",
    {
      description:
        "Delete one or more emails. Moves to Trash by default. Set permanent=true to permanently delete (skips Trash). Always confirm with the user before calling this tool.",
      inputSchema: {
        email_uids: z
          .array(z.number())
          .describe("Array of email UIDs to delete"),
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Mailbox folder (default: "INBOX")'),
        permanent: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, permanently delete instead of moving to Trash (default: false)"
          ),
      },
    },
    async ({ email_uids, folder, permanent }) => {
      try {
        await imap.deleteEmail(email_uids, folder, permanent);
        const action = permanent ? "Permanently deleted" : "Moved to Trash";
        return {
          content: [
            {
              type: "text",
              text: `${action}: ${email_uids.length} email(s) from ${folder}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "move_email",
    {
      description: "Move one or more emails to a different folder.",
      inputSchema: {
        email_uids: z
          .array(z.number())
          .describe("Array of email UIDs to move"),
        target_folder: z.string().describe("Destination folder path"),
        folder: z
          .string()
          .optional()
          .default("INBOX")
          .describe('Source mailbox folder (default: "INBOX")'),
      },
    },
    async ({ email_uids, target_folder, folder }) => {
      try {
        await imap.moveEmail(email_uids, target_folder, folder);
        return {
          content: [
            {
              type: "text",
              text: `Moved ${email_uids.length} email(s) from ${folder} to ${target_folder}.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error moving email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "send_email",
    {
      description:
        "Send a new email or reply to an existing one. Always read the draft back to the user and get confirmation before calling this tool.",
      inputSchema: {
        to: z.string().describe("Recipient email address(es), comma-separated"),
        subject: z.string().describe("Email subject line"),
        body: z.string().describe("Email body (plain text)"),
        cc: z
          .string()
          .optional()
          .describe("CC recipients, comma-separated"),
        bcc: z
          .string()
          .optional()
          .describe("BCC recipients, comma-separated"),
        reply_to_id: z
          .string()
          .optional()
          .describe(
            "Message-ID of the email being replied to (for threading)"
          ),
      },
    },
    async ({ to, subject, body, cc, bcc, reply_to_id }) => {
      try {
        const messageId = await smtp.sendEmail({
          to,
          subject,
          body,
          cc,
          bcc,
          inReplyTo: reply_to_id,
        });
        return {
          content: [
            {
              type: "text",
              text: `Email sent successfully to ${to}. Message ID: ${messageId}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error sending email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
