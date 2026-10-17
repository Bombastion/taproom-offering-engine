import { describe, expect, it } from 'vitest';
import { Request } from 'express';
import { newSessionToken, readCookie, sessionIdForToken } from '../../auth/sessions';

function requestWithCookie(cookie: string | undefined): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as Request;
}

describe('newSessionToken', () => {
  it('makes unguessable, unique tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newSessionToken().token));
    expect(tokens.size).toBe(50);
    const [token] = [...tokens];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores only a hash of the token', () => {
    const { token, id } = newSessionToken();
    expect(id).not.toBe(token);
    expect(id).toBe(sessionIdForToken(token));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('readCookie', () => {
  it.each([
    ['a=1; toe_session=abc; b=2', 'abc'],
    ['toe_session=abc', 'abc'],
    ['  toe_session = abc ', 'abc'],
    ['toe_session=a%20b', 'a b'],
    ['xtoe_session=nope; toe_session=yes', 'yes'],
  ])('reads %j', (header, expected) => {
    expect(readCookie(requestWithCookie(header), 'toe_session')).toBe(expected);
  });

  it.each([
    ['no cookie header', undefined],
    ['other cookies only', 'a=1; b=2'],
    ['a name that merely ends the same', 'not_toe_session=1'],
    ['no equals sign', 'toe_session'],
    ['bad percent-encoding', 'toe_session=%E0%A4%A'],
  ])('returns null for %s', (_label, header) => {
    expect(readCookie(requestWithCookie(header), 'toe_session')).toBeNull();
  });
});
