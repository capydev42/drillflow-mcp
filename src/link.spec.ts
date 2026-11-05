import { describe, it, expect } from 'vitest';
import { parseLink } from './link';

describe('parseLink', () => {
  it('takes a bare slug', () => {
    expect(parseLink('aB3xK9pQ')).toEqual({ kind: 'slug', slug: 'aB3xK9pQ' });
  });

  it('takes the share URL people actually copy', () => {
    expect(parseLink('https://app.drillflow.de/view/aB3xK9pQ')).toEqual({
      kind: 'slug',
      slug: 'aB3xK9pQ',
    });
    expect(parseLink('  /view/aB3xK9pQ  ')).toEqual({ kind: 'slug', slug: 'aB3xK9pQ' });
  });

  it('takes a readable address, and lowercases it', () => {
    expect(parseLink('https://app.drillflow.de/view/@maria/onboarding-flow')).toEqual({
      kind: 'named',
      handle: 'maria',
      name: 'onboarding-flow',
    });
    expect(parseLink('@Maria/Onboarding-Flow')).toEqual({
      kind: 'named',
      handle: 'maria',
      name: 'onboarding-flow',
    });
  });

  it('accepts the API form too, since that is what a log shows', () => {
    expect(parseLink('https://api.drillflow.de/api/doc/aB3xK9pQ')).toEqual({
      kind: 'slug',
      slug: 'aB3xK9pQ',
    });
  });

  it('refuses what it cannot address', () => {
    // A slug is exactly 8 Base62 characters; anything else is not one.
    expect(() => parseLink('short')).toThrow(/Not a usable link/);
    expect(() => parseLink('')).toThrow(/share link/);
    expect(() => parseLink('https://app.drillflow.de/')).toThrow(/Not a usable link/);
    expect(() => parseLink('@m/x')).toThrow(/Not a usable link/);
  });
});
