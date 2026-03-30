import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readProfile, writeProfile } from '../storage/index.js'
import { extractSection, replaceSection, deleteEntry } from '../utils/profile-utils.js'

export function registerProfileTools(server: McpServer, userId: string): void {
  server.tool(
    'read_profile',
    'Read the user profile which contains their preferences, contacts, behavior rules, and learned patterns. Call this silently at the start of every conversation to personalize responses.',
    {
      section: z
        .string()
        .optional()
        .describe(
          'Specific section to read (e.g. "Behavior Rules", "Priority Contacts"). Omit to read the full profile.'
        ),
    },
    async ({ section }) => {
      try {
        const content = await readProfile(userId)
        if (section) {
          const extracted = extractSection(content, section)
          if (extracted === null) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Section "${section}" not found. Read the full profile to see available sections.`,
                },
              ],
            }
          }
          return { content: [{ type: 'text', text: `## ${section}\n${extracted}` }] }
        }
        return { content: [{ type: 'text', text: content }] }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'update_profile',
    'Update a section of the user profile when they teach you a preference, introduce an important contact, or establish a new rule. Prefer append for adding new rules.',
    {
      section: z
        .string()
        .describe('Profile section to update (e.g. "Behavior Rules", "Email Preferences")'),
      content: z.string().describe('Content to add or set in the section'),
      mode: z
        .enum(['append', 'replace'])
        .default('append')
        .describe('"append" adds to existing content, "replace" overwrites the section'),
    },
    async ({ section, content: newContent, mode }) => {
      try {
        const current = await readProfile(userId)
        const updated = replaceSection(current, section, newContent, mode)
        await writeProfile(userId, updated)
        return {
          content: [{ type: 'text', text: `Updated "${section}" (${mode}).` }],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'delete_profile_entry',
    'Surgically remove a single entry from a profile section without overwriting the rest. Use when the user says "forget that rule" or explicitly revokes a preference.',
    {
      section: z.string().describe('Profile section containing the entry to remove'),
      entry_substring: z
        .string()
        .describe(
          'Substring of the line to remove. The first matching line in the section is deleted.'
        ),
    },
    async ({ section, entry_substring }) => {
      try {
        const current = await readProfile(userId)
        const updated = deleteEntry(current, section, entry_substring)
        if (updated === current) {
          return {
            content: [
              {
                type: 'text',
                text: `No line matching "${entry_substring}" found in "${section}".`,
              },
            ],
          }
        }
        await writeProfile(userId, updated)
        return {
          content: [{ type: 'text', text: `Removed entry from "${section}".` }],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'log_interaction',
    'Append a timestamped entry to the "Learned Patterns" section of the user profile. Use this to record durable behavioral patterns you observe during conversation.',
    {
      entry: z
        .string()
        .describe(
          'A concise description of what was learned (e.g. "User ignores all emails from recruiters at staffing agencies")'
        ),
    },
    async ({ entry }) => {
      try {
        const timestamp = new Date().toISOString()
        const current = await readProfile(userId)
        const updated = replaceSection(
          current,
          'Learned Patterns',
          `- [${timestamp}] ${entry}`,
          'append'
        )
        await writeProfile(userId, updated)
        return { content: [{ type: 'text', text: 'Logged to Learned Patterns.' }] }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )
}
