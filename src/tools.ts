import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validateDocument } from '../../app/src/lib/validateDocument';
import { parseMermaidFlowchart } from '../../app/src/lib/mermaidImport';
import type { DrillFlowDocument } from '../../app/src/types';
import type { Config } from './config';
import { publishDocument, readDocument, type PublishResult } from './api';

/** The sentence every publish result ends with. An anonymous link is not a
 *  lesser version of an owned one, it is a different thing — unlisted,
 *  unrevocable, gone in 90 days — and the agent has to be able to say so. */
function ownership(result: PublishResult): string {
  return result.owned
    ? 'It belongs to your account: listed under Your account → My shared links, renameable, revocable, and it does not expire on its own.'
    : 'Published ANONYMOUSLY (no DRILLFLOW_TOKEN is configured): nobody owns this link, it cannot be listed or revoked, and it stops working 90 days from now.';
}

function publishText(result: PublishResult, extra?: string): string {
  return [
    result.url,
    ownership(result),
    result.warnings.length
      ? `The document was incomplete and DrillFlow filled in: ${result.warnings.join(', ')}.`
      : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });

const PUBLIC_WARNING =
  'Publishing puts the diagram on a public read-only URL that anyone holding the link can open. Ask the user before publishing anything confidential.';

export function registerTools(server: McpServer, config: Config): void {
  server.registerTool(
    'publish_diagram',
    {
      title: 'Publish a DrillFlow diagram',
      description:
        `Publish a DrillFlow document and get back a shareable read-only link with working drill-down. ` +
        `The document format is documented at https://drillflow.de/en/format/. ${PUBLIC_WARNING}`,
      inputSchema: {
        document: z
          .record(z.string(), z.unknown())
          .describe('A complete DrillFlow document object (id, title, rootDiagramId, diagrams).'),
      },
    },
    async ({ document }) => {
      // Validated HERE as well as by the API: the same check, but it names the
      // element and the field, where a 422 only says the body was refused.
      const doc = validateDocument(document) as DrillFlowDocument;
      return ok(publishText(await publishDocument(config, doc)));
    },
  );

  server.registerTool(
    'publish_mermaid',
    {
      title: 'Publish a Mermaid flowchart as a DrillFlow diagram',
      description:
        `Convert a Mermaid flowchart into a DrillFlow diagram and publish it. Every \`subgraph\` becomes a real ` +
        `drill-down subflow you can navigate into — that is the point of using DrillFlow rather than a flat picture. ` +
        `Only flowcharts (\`flowchart\` / \`graph\`) are supported. ${PUBLIC_WARNING}`,
      inputSchema: {
        mermaid: z.string().min(1).describe('The Mermaid flowchart source.'),
        title: z.string().optional().describe('Document title; defaults to "Imported".'),
        routeLongEdges: z
          .boolean()
          .optional()
          .describe('Route connections that skip several levels around the shapes. Default true.'),
      },
    },
    async ({ mermaid, title, routeLongEdges }) => {
      const { document, droppedEdges } = parseMermaidFlowchart(mermaid, {
        title,
        route: routeLongEdges ?? true,
      });
      const result = await publishDocument(config, validateDocument(document) as DrillFlowDocument);
      return ok(
        publishText(
          result,
          droppedEdges
            ? `${droppedEdges} link${droppedEdges === 1 ? '' : 's'} crossed subflow boundaries in a way DrillFlow cannot draw and ${droppedEdges === 1 ? 'was' : 'were'} skipped.`
            : undefined,
        ),
      );
    },
  );

  server.registerTool(
    'read_diagram',
    {
      title: 'Read a published DrillFlow diagram',
      description:
        'Fetch a published diagram as its DrillFlow document, so it can be inspected or extended. ' +
        'Takes a share URL, a /view/@handle/name address, or the 8-character slug.',
      inputSchema: {
        link: z.string().min(1).describe('Share URL, @handle/name address, or slug.'),
        password: z
          .string()
          .optional()
          .describe('Required only for a password-protected link.'),
      },
    },
    async ({ link, password }) => {
      const { document, allowCopy } = await readDocument(config, link, password);
      const note = allowCopy
        ? ''
        : '\n\nThe owner asked that this diagram not be taken away as a document. Treat it as read-only material and do not republish it as your own.';
      return ok(JSON.stringify(document, null, 2) + note);
    },
  );
}
