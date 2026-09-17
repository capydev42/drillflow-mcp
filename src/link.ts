/**
 * What a person pastes when they mean "this diagram".
 *
 * Four shapes reach us: the bare Base62 slug, a `/view/<slug>` path, a readable
 * `/view/@handle/name` (C1b), and any of those as a full URL. They resolve to
 * two different API routes, so the parse has to say WHICH — and a slug is not
 * distinguishable from a name by looks alone (`onboarding` is a legal name and
 * an illegal slug only because of its length), so the path shape decides.
 */
export type ParsedLink =
  | { kind: 'slug'; slug: string }
  | { kind: 'named'; handle: string; name: string };

const SLUG = /^[A-Za-z0-9]{8}$/;
const HANDLE = /^[a-z0-9-]{3,30}$/;
const NAME = /^[a-z0-9-]{3,48}$/;

export function parseLink(input: string): ParsedLink {
  const raw = input.trim();
  if (!raw) throw new Error('Give a share link or its slug.');

  // Strip an origin if there is one; everything below works on the path.
  let path = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      throw new Error(`Not a usable link: ${raw}`);
    }
  }

  const parts = path.split('/').filter(Boolean);
  // Drop a leading `view` / `api/doc`, so both a browser URL and an API URL work.
  if (parts[0] === 'view') parts.shift();
  else if (parts[0] === 'api' && parts[1] === 'doc') parts.splice(0, 2);

  if (parts.length === 2 && parts[0].startsWith('@')) {
    const handle = parts[0].slice(1).toLowerCase();
    const name = parts[1].toLowerCase();
    if (!HANDLE.test(handle) || !NAME.test(name)) {
      throw new Error(`Not a usable link: ${raw}`);
    }
    return { kind: 'named', handle, name };
  }
  if (parts.length === 1 && SLUG.test(parts[0])) {
    return { kind: 'slug', slug: parts[0] };
  }
  throw new Error(
    `Not a usable link: ${raw}. Expected a share URL, a /view/@handle/name address, or an 8-character slug.`,
  );
}
