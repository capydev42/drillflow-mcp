import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readConfig } from './config';
import { registerTools } from './tools';

/** Replaced with package.json's version at build time (build.mjs). */
declare const __DF_VERSION__: string;

/**
 * DrillFlow over MCP (C2b).
 *
 * A thin stdio server over the PUBLIC API — no new endpoints, no service on the
 * VPS. What it adds is reach: an MCP server is installable in Claude Desktop,
 * Claude Code and ChatGPT connectors, which puts DrillFlow in the tool list
 * instead of waiting for someone to find llms.txt.
 *
 * The Mermaid importer, the layout and the validator are the EDITOR's own
 * modules, bundled in at build time, so an agent's diagram is laid out exactly
 * like one made by hand.
 */
async function main(): Promise<void> {
  const config = readConfig();
  const server = new McpServer({ name: 'drillflow', version: typeof __DF_VERSION__ === 'string' ? __DF_VERSION__ : '0.0.0' });
  registerTools(server, config);
  // stdout belongs to the protocol — anything logged there corrupts a message.
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error('drillflow-mcp failed to start:', err);
  process.exit(1);
});
