import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readLog, appendToLog, listLogDates, searchLogs } from '../storage/index.js'

export function registerMemoryTools(server: McpServer, userId: string): void {
  server.tool(
    'save_conversation_note',
    "Append a timestamped note to today's conversation log. Use to record important facts, decisions, or context mid-conversation so they can be recalled later.",
    {
      note: z
        .string()
        .describe('The fact, decision, or context to save for future reference'),
    },
    async ({ note }) => {
      try {
        await appendToLog(userId, note)
        return { content: [{ type: 'text', text: "Note saved to today's log." }] }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'get_conversation_log',
    'Retrieve a conversation log for a specific date. Use when the user references something that happened in a past session.',
    {
      date: z
        .string()
        .optional()
        .describe('Date in YYYY-MM-DD format. Defaults to today.'),
    },
    async ({ date }) => {
      try {
        const content = await readLog(userId, date)
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
    'list_conversation_history',
    'List all dates that have conversation logs, newest first. Use to know what history is available before calling get_conversation_log or search_conversation_logs.',
    {},
    async () => {
      try {
        const dates = await listLogDates(userId)
        if (dates.length === 0) {
          return { content: [{ type: 'text', text: 'No conversation logs yet.' }] }
        }
        return {
          content: [
            {
              type: 'text',
              text: `Conversation logs available:\n${dates.map((d) => `- ${d}`).join('\n')}`,
            },
          ],
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
    'search_conversation_logs',
    'Search across all conversation logs for a keyword or phrase. Use when the user references something from a past conversation and you need to find when it was discussed.',
    {
      query: z.string().describe('Text to search for (case-insensitive)'),
      from_date: z
        .string()
        .optional()
        .describe('Start of date range, YYYY-MM-DD (inclusive)'),
      to_date: z
        .string()
        .optional()
        .describe('End of date range, YYYY-MM-DD (inclusive)'),
    },
    async ({ query, from_date, to_date }) => {
      try {
        const results = await searchLogs(userId, query, from_date, to_date)
        if (results.length === 0) {
          return { content: [{ type: 'text', text: `No matches found for "${query}".` }] }
        }
        const lines = results.map((r) => `[${r.date}] ${r.line}`)
        return {
          content: [
            {
              type: 'text',
              text: `Found ${results.length} match${results.length === 1 ? '' : 'es'} for "${query}":\n\n${lines.join('\n')}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )
}
