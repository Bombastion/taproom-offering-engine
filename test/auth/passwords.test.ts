import { describe, expect, it } from 'vitest';
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from '../../auth/passwords';
import { FAST_COST } from '../helpers';

describe('hashPassword', () => {
  it('produces a self-describing scrypt hash', async () => {
    const hash = await hashPassword('hunter2', FAST_COST);
    const [scheme, logN, r, p, salt, key] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect([logN, r, p]).toEqual(['4', '8', '1']);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(key, 'base64')).toHaveLength(64);
    expect(hash).not.toContain('hunter2');
  });

  it('salts every hash differently', async () => {
    expect(await hashPassword('same', FAST_COST)).not.toBe(await hashPassword('same', FAST_COST));
  });

  it('uses a real cost by default', async () => {
    expect((await hashPassword('x')).startsWith('scrypt$15$8$1$')).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse', FAST_COST);
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('correct hors', hash)).toBe(false);
    expect(await verifyPassword('Correct horse', hash)).toBe(false);
    expect(await verifyPassword('correct horse ', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('verifies with the cost stored in the hash, whatever the current default is', async () => {
    const cheap = await hashPassword('pw', { logN: 2, r: 1, p: 1 });
    const other = await hashPassword('pw', { logN: 6, r: 2, p: 1 });
    expect(await verifyPassword('pw', cheap)).toBe(true);
    expect(await verifyPassword('pw', other)).toBe(true);
  });

  it('treats equivalent Unicode spellings as the same password', async () => {
    const hash = await hashPassword('café🍺', FAST_COST);
    expect(await verifyPassword('café🍺', hash)).toBe(true);
  });

  it('is false when there is no hash to check against', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['wrong scheme', 'bcrypt$4$8$1$c2FsdA==$a2V5'],
    ['too few parts', 'scrypt$4$8$1$c2FsdA=='],
    ['non-numeric cost', 'scrypt$x$8$1$c2FsdA==$a2V5'],
    ['cost too high to run', 'scrypt$30$8$1$c2FsdA==$a2V5'],
    ['zero cost', 'scrypt$0$8$1$c2FsdA==$a2V5'],
    ['block size too high', 'scrypt$4$99$1$c2FsdA==$a2V5'],
    ['parallelism too high', 'scrypt$4$8$99$c2FsdA==$a2V5'],
    ['empty salt', 'scrypt$4$8$1$$a2V5'],
    ['empty key', 'scrypt$4$8$1$c2FsdA==$'],
  ])('rejects a malformed stored hash (%s) without throwing', async (_label, stored) => {
    expect(await verifyPassword('pw', stored)).toBe(false);
  });

  it('rejects passwords longer than the limit without hashing them', async () => {
    const hash = await hashPassword('a'.repeat(MAX_PASSWORD_LENGTH), FAST_COST);
    expect(await verifyPassword('a'.repeat(MAX_PASSWORD_LENGTH), hash)).toBe(true);
    expect(await verifyPassword('a'.repeat(MAX_PASSWORD_LENGTH + 1), hash)).toBe(false);
  });
});
