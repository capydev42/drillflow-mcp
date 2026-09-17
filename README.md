# drillflow-mcp

> **Generated. Do not edit here.** Every file in this repository is copied from
> the DrillFlow source repository on each release; changes made here are
> overwritten by the next sync. Please open issues rather than pull requests.

An [MCP](https://modelcontextprotocol.io) server for
[DrillFlow](https://drillflow.de) — the diagram editor built around
**drill-down**, where a node can own a whole sub-diagram you navigate *into*.

With this server an agent can turn a Mermaid flowchart into a real hierarchical
diagram, publish it to a shareable read-only link, and read published diagrams
back. Every `subgraph` becomes a subflow a reader can actually open, which is
what a flat picture cannot do.

## Install

Claude Desktop (`claude_desktop_config.json`) or any MCP host:

```json
{
  "mcpServers": {
    "drillflow": {
      "command": "npx",
      "args": ["-y", "drillflow-mcp"],
      "env": { "DRILLFLOW_TOKEN": "dfp_…" }
    }
  }
}
```

Claude Code:

```bash
claude mcp add drillflow --env DRILLFLOW_TOKEN=dfp_… -- npx -y drillflow-mcp
```

Node 20 or newer.

## Tools

| Tool | What it does |
|---|---|
| `publish_diagram` | Publishes a DrillFlow document, returns the share URL. |
| `publish_mermaid` | Converts a Mermaid flowchart (subgraphs → subflows) and publishes it. |
| `read_diagram` | Reads a published diagram back as its document — share URL, `@handle/name` address or slug. |

Publishing puts the diagram on a **public** read-only URL that anyone holding
the link can open. Nothing is published without the host asking you first.

## Configuration

| Variable | Meaning |
|---|---|
| `DRILLFLOW_TOKEN` | An API token from **Your account → API tokens** at [app.drillflow.de](https://app.drillflow.de). Optional. |
| `DRILLFLOW_API_URL` | Defaults to `https://api.drillflow.de`. |

**Without a token the server publishes anonymously**, and says so in every
result: nobody owns the link, it cannot be listed or revoked, and it stops
working after 90 days. With a token the link belongs to your account — listed
under *My shared links*, renameable, revocable, no expiry.

## Format

The document format is documented at
<https://drillflow.de/en/format/>, with a JSON Schema at
<https://drillflow.de/schema/drillflow-document.schema.json>. There is also a
Claude Skill for generating DrillFlow diagrams:
[capydev42/drillflow-skill](https://github.com/capydev42/drillflow-skill).

## Building

This repository holds the server's own sources, which is what the MIT licence
below covers. It is **not a standalone build**: the package bundles a few
modules from the (closed-source) DrillFlow editor — the Mermaid importer and
the document validator — so the published `drillflow-mcp` on npm is built from
the DrillFlow repository, not from here. Install it with `npx`; read it here.

## Licence

MIT — see `LICENSE`. This covers the MCP server in this repository, not the
DrillFlow application.

## Issues

Bug reports are welcome in this repository's issue tracker, or by mail to
<support@drillflow.de>.
