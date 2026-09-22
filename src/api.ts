import type { DrillFlowDocument } from '../../app/src/types';
import type { Config } from './config';
import { parseLink } from './link';

/**
 * The DrillFlow API, as much of it as three tools need. Deliberately thin: the
 * server adds no capability, it only makes the existing public endpoints
 * reachable from a tool list (C2b — distribution, not capability).
 */

export interface PublishResult {
  slug: string;
  url: string;
  warnings: string[];
  /** False when no token was configured: the link is unowned and expires. */
  owned: boolean;
}

export interface ReadResult {
  document: DrillFlowDocument;
  slug: string;
  allowCopy: boolean;
}

/** HTTP answers an agent can act on, in words rather than status codes. */
async function explain(res: Response, what: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
  const detail = typeof body.detail === 'string' ? body.detail : '';
  switch (res.status) {
    case 401:
      return new Error(
        detail.toLowerCase().includes('token')
          ? 'DRILLFLOW_TOKEN is not valid — it may have been revoked or expired. Mint a new one under Your account → API tokens.'
          : `Not authorised: ${detail || what}`,
      );
    case 403:
      return new Error(detail || 'Refused.');
    case 404:
      return new Error('No such diagram — the link may have been revoked, or it expired.');
    case 413:
      return new Error(
        'The document is too large to publish (2 MB, or 8 MB for an account on a paid plan).',
      );
    case 422:
      return new Error(`The API refused the document${detail ? `: ${detail}` : '.'}`);
    case 429:
      return new Error('Rate limited (10 publishes per minute per IP) — wait a moment and retry.');
    default:
      return new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
}

function headers(config: Config, json: boolean): Record<string, string> {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    // Absent token = anonymous publish, which the API allows and which the
    // result reports. A token that exists but is dead is a 401, never a quiet
    // fallback — the server side guarantees that (C2).
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };
}

export async function publishDocument(
  config: Config,
  document: DrillFlowDocument,
): Promise<PublishResult> {
  const res = await fetch(`${config.apiUrl}/api/doc`, {
    method: 'POST',
    headers: headers(config, true),
    body: JSON.stringify({ data: document }),
  });
  if (!res.ok) throw await explain(res, 'Publishing');
  const body = (await res.json()) as { slug: string; url: string; warnings?: string[] };
  return {
    slug: body.slug,
    url: body.url,
    warnings: body.warnings ?? [],
    owned: Boolean(config.token),
  };
}

export async function readDocument(
  config: Config,
  link: string,
  password?: string,
): Promise<ReadResult> {
  const parsed = parseLink(link);
  const path =
    parsed.kind === 'slug'
      ? `/api/doc/${parsed.slug}`
      : `/api/doc/@${parsed.handle}/${parsed.name}`;
  const res = await fetch(`${config.apiUrl}${path}`, { headers: headers(config, false) });

  if (res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { protected?: boolean; slug?: string };
    if (body.protected) {
      // The slug is what unlock is addressed by, and a named route hands it over.
      const slug = parsed.kind === 'slug' ? parsed.slug : body.slug;
      if (!password) {
        throw new Error('This diagram is password protected — call again with its password.');
      }
      if (!slug) throw new Error('This diagram is password protected and its slug is unknown.');
      return unlockDocument(config, slug, password);
    }
  }
  if (!res.ok) throw await explain(res, 'Reading');
  const body = (await res.json()) as { data: DrillFlowDocument; allowCopy?: boolean; slug?: string };
  return {
    document: body.data,
    slug: parsed.kind === 'slug' ? parsed.slug : (body.slug ?? ''),
    allowCopy: body.allowCopy ?? true,
  };
}

async function unlockDocument(
  config: Config,
  slug: string,
  password: string,
): Promise<ReadResult> {
  const res = await fetch(`${config.apiUrl}/api/doc/${slug}/unlock`, {
    method: 'POST',
    headers: headers(config, true),
    body: JSON.stringify({ password }),
  });
  if (res.status === 403) throw new Error('Wrong password for this diagram.');
  if (!res.ok) throw await explain(res, 'Unlocking');
  const body = (await res.json()) as { data: DrillFlowDocument; allowCopy?: boolean };
  return { document: body.data, slug, allowCopy: body.allowCopy ?? true };
}
