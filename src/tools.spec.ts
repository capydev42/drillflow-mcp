import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { validateDocument } from '../../app/src/lib/validateDocument';
import { registerTools } from './tools';
import type { Config } from './config';

// Driven through a real client over the in-memory transport pair: the schemas,
// the names and the results are then exactly what an MCP host would see, rather
// than what a hand-called handler returns.

const CONFIG: Config = { apiUrl: 'https://api.example.test', token: 'dfp_secret' };
const ANON: Config = { apiUrl: 'https://api.example.test' };

const DOC = {
  id: 'd1',
  title: 'T',
  rootDiagramId: 'r',
  diagrams: { r: { id: 'r', title: 'Root', nodes: [], edges: [] } },
};

async function connect(config: Config) {
  const server = new McpServer({ name: 'drillflow', version: 'test' });
  registerTools(server, config);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  return client;
}

/** The text a tool answered with, or the error it threw. */
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  return { text: res.content.map((c) => c.text).join('\n'), isError: Boolean(res.isError) };
}

let fetchMock: ReturnType<typeof vi.fn>;

function reply(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('the tool surface', () => {
  it('offers exactly the three documented tools', async () => {
    const client = await connect(CONFIG);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(['publish_diagram', 'publish_mermaid', 'read_diagram']);
  });

  it('says publishing is public, in every publishing tool', async () => {
    const client = await connect(CONFIG);
    for (const tool of (await client.listTools()).tools) {
      if (tool.name.startsWith('publish')) {
        expect(tool.description).toMatch(/public/i);
      }
    }
  });
});

describe('publish_diagram', () => {
  it('sends the document with the token and reports ownership', async () => {
    fetchMock.mockReturnValue(reply({ slug: 'aB3xK9pQ', url: 'https://app.example.test/view/aB3xK9pQ' }));
    const client = await connect(CONFIG);
    const { text, isError } = await call(client, 'publish_diagram', { document: DOC });

    expect(isError).toBe(false);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/doc');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer dfp_secret');
    expect(JSON.parse(init.body as string)).toEqual({ data: expect.objectContaining({ id: 'd1' }) });
    expect(text).toContain('https://app.example.test/view/aB3xK9pQ');
    expect(text).toContain('belongs to your account');
  });

  it('without a token it publishes anonymously AND says so', async () => {
    fetchMock.mockReturnValue(reply({ slug: 'aB3xK9pQ', url: 'https://app.example.test/view/aB3xK9pQ' }));
    const client = await connect(ANON);
    const { text } = await call(client, 'publish_diagram', { document: DOC });

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(text).toContain('ANONYMOUSLY');
    expect(text).toContain('90 days');
  });

  it('refuses a broken document before it reaches the network', async () => {
    const client = await connect(CONFIG);
    const { text, isError } = await call(client, 'publish_diagram', { document: { id: 'x' } });
    expect(isError).toBe(true);
    expect(text).toMatch(/Invalid DrillFlow document/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the API warnings on — an agent never sees the editor heal them', async () => {
    fetchMock.mockReturnValue(
      reply({ slug: 's', url: 'u', warnings: ['node d1/n1: missing size'] }),
    );
    const client = await connect(CONFIG);
    const { text } = await call(client, 'publish_diagram', { document: DOC });
    expect(text).toContain('missing size');
  });
});

describe('publish_mermaid', () => {
  it('converts subgraphs into real subflows and publishes the result', async () => {
    fetchMock.mockReturnValue(reply({ slug: 's', url: 'https://app.example.test/view/s' }));
    const client = await connect(CONFIG);
    const { text, isError } = await call(client, 'publish_mermaid', {
      mermaid: 'flowchart TD\n  A[Start] --> B[Ship]\n  subgraph Ship\n    C[Pack] --> D[Send]\n  end',
      title: 'Orders',
    });

    expect(isError).toBe(false);
    expect(text).toContain('https://app.example.test/view/s');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string).data;
    // The document the editor would have produced: valid, titled, and deeper
    // than one level.
    expect(() => validateDocument(sent)).not.toThrow();
    expect(sent.title).toBe('Orders');
    expect(Object.keys(sent.diagrams).length).toBeGreaterThan(1);
    // Deliberately UNPOSITIONED: SPEC tells generated documents to leave the
    // placing to whoever opens them, and it keeps the editor's layout engine
    // out of a published npm package that would only recompute what the reader
    // computes anyway.
    const nodes = Object.values(sent.diagrams).flatMap((d: any) => d.nodes);
    expect(nodes.length).toBeGreaterThan(2);
    expect(nodes.every((n: any) => n.x === undefined && n.y === undefined)).toBe(true);
  });

  it('reports a Mermaid input it cannot import, without publishing', async () => {
    const client = await connect(CONFIG);
    const { text, isError } = await call(client, 'publish_mermaid', { mermaid: 'sequenceDiagram\n A->>B: hi' });
    expect(isError).toBe(true);
    expect(text).toMatch(/mermaid:unsupported-type/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('read_diagram', () => {
  it('reads a slug and returns the document', async () => {
    fetchMock.mockReturnValue(reply({ data: DOC, allowCopy: true }));
    const client = await connect(CONFIG);
    const { text } = await call(client, 'read_diagram', { link: 'https://app.example.test/view/aB3xK9pQ' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/doc/aB3xK9pQ');
    expect(JSON.parse(text)).toEqual(DOC);
  });

  it('reads a readable address through the named route', async () => {
    fetchMock.mockReturnValue(reply({ data: DOC, slug: 'aB3xK9pQ', allowCopy: true }));
    const client = await connect(CONFIG);
    await call(client, 'read_diagram', { link: '@maria/onboarding-flow' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/doc/@maria/onboarding-flow');
  });

  it('asks for the password rather than failing vaguely', async () => {
    fetchMock.mockReturnValue(reply({ detail: 'protected', protected: true }, 401));
    const client = await connect(CONFIG);
    const { text, isError } = await call(client, 'read_diagram', { link: 'aB3xK9pQ' });
    expect(isError).toBe(true);
    expect(text).toMatch(/password protected/);
  });

  it('unlocks with one, through the slug route', async () => {
    fetchMock
      .mockReturnValueOnce(reply({ detail: 'protected', protected: true }, 401))
      .mockReturnValueOnce(reply({ data: DOC, allowCopy: false }));
    const client = await connect(CONFIG);
    const { text } = await call(client, 'read_diagram', { link: 'aB3xK9pQ', password: 'hunter2' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/doc/aB3xK9pQ/unlock');
    // allowCopy:false is a stated wish, and the agent is told about it.
    expect(text).toMatch(/not be taken away as a document/);
  });
});

describe('error translation', () => {
  const cases: Array<[number, RegExp]> = [
    [401, /DRILLFLOW_TOKEN is not valid/],
    [413, /too large/],
    [422, /refused the document/],
    [429, /Rate limited/],
  ];

  it.each(cases)('turns %i into something actionable', async (status, expected) => {
    fetchMock.mockReturnValue(reply({ detail: 'Invalid or expired API token' }, status));
    const client = await connect(CONFIG);
    const { text, isError } = await call(client, 'publish_diagram', { document: DOC });
    expect(isError).toBe(true);
    expect(text).toMatch(expected);
  });
});
