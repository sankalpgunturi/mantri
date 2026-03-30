import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  listTemplates,
  readTemplate,
  writeTemplate,
  deleteTemplate,
} from '../storage/index.js'

export function registerTemplateTools(server: McpServer, userId: string): void {
  server.tool(
    'list_templates',
    'List all saved email templates by name. Use before get_template to discover available templates.',
    {},
    async () => {
      try {
        const names = await listTemplates(userId)
        if (names.length === 0) {
          return { content: [{ type: 'text', text: 'No templates saved yet.' }] }
        }
        return {
          content: [{ type: 'text', text: `Templates:\n${names.map((n) => `- ${n}`).join('\n')}` }],
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
    'get_template',
    'Retrieve a saved email template by name.',
    {
      name: z.string().describe('Template name (case-sensitive, without .md extension)'),
    },
    async ({ name }) => {
      try {
        const content = await readTemplate(userId, name)
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
    'save_template',
    'Save or overwrite an email template. Use when the user creates or refines a reusable email format.',
    {
      name: z.string().describe('Template name (no spaces, e.g. "rejection_reply")'),
      content: z.string().describe('Full template text, including any placeholders'),
    },
    async ({ name, content }) => {
      try {
        await writeTemplate(userId, name, content)
        return { content: [{ type: 'text', text: `Template "${name}" saved.` }] }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )

  server.tool(
    'delete_template',
    'Delete a saved email template.',
    {
      name: z.string().describe('Template name to delete'),
    },
    async ({ name }) => {
      try {
        await deleteTemplate(userId, name)
        return { content: [{ type: 'text', text: `Template "${name}" deleted.` }] }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        }
      }
    }
  )
}
