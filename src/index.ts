import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateConfig } from "./config.js";
import { registerReadingTools } from "./tools/reading.js";
import { registerActionTools } from "./tools/actions.js";
import { registerMemoryTools } from "./tools/memory.js";

const server = new McpServer({
  name: "mantri",
  version: "0.1.0",
});

registerReadingTools(server);
registerActionTools(server);
registerMemoryTools(server);

async function main() {
  validateConfig();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mantri MCP server running on stdio — 12 tools registered");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
