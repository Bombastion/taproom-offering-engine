import crypto from 'crypto';
import { promisify } from 'util';

/*
Password hashing with scrypt from Node's standard library (no native dependency to build in the
Docker image). A stored hash looks like

    scrypt$<log2 N>$<r>$<p>$<salt, base64>$<key, base64>

and carries its own cost parameters, so the cost can be raised later without invalidating existing
passwords: old hashes keep verifying with the parameters they were made with.
*/

const scrypt = promisify(crypto.scrypt) as (
    password: crypto.BinaryLike,
    salt: crypto.BinaryLike,
    keyLength: number,
    options: crypto.ScryptOptions,
) => Promise<Buffer>;

export type ScryptCost = { logN: number; r: number; p: number };

// About 32 MiB and ~100 ms per hash on a small server
export const DEFAULT_COST: ScryptCost = { logN: 15, r: 8, p: 1 };

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// The shortest password a new account (or a changed password) may have
export const MIN_PASSWORD_LENGTH = 10;

// Login forms accept long passphrases, but not unbounded input to a deliberately slow function
export const MAX_PASSWORD_LENGTH = 1024;

// Refuse to run a hash whose stored parameters would tie the server up (a corrupted or tampered row)
const MAX_LOG_N = 20;
const MAX_R = 16;
const MAX_P = 4;

function derive(password: string, salt: Buffer, cost: ScryptCost, keyLength: number): Promise<Buffer> {
    const N = 2 ** cost.logN;
    return scrypt(password.normalize('NFKC'), salt, keyLength, {
        N,
        r: cost.r,
        p: cost.p,
        // Node refuses when roughly 128 * N * r exceeds this
        maxmem: 256 * N * cost.r,
    });
}

export async function hashPassword(password: string, cost: ScryptCost = DEFAULT_COST): Promise<string> {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, cost, KEY_LENGTH);
    return ['scrypt', cost.logN, cost.r, cost.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function parse(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | null {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
    const [logN, r, p] = [parts[1], parts[2], parts[3]].map((part) => (/^\d+$/.test(part) ? parseInt(part, 10) : NaN));
    if (!(logN >= 1 && logN <= MAX_LOG_N) || !(r >= 1 && r <= MAX_R) || !(p >= 1 && p <= MAX_P)) return null;
    const salt = Buffer.from(parts[4], 'base64');
    const key = Buffer.from(parts[5], 'base64');
    if (salt.length === 0 || key.length === 0) return null;
    return { cost: { logN, r, p }, salt, key };
}

// A throwaway hash at the default cost, made once on first use. Checking a password against it
// when there's no real hash to check (unknown email, account with no password) keeps the response
// time the same either way, so timing doesn't reveal which emails have accounts.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
    if (password.length > MAX_PASSWORD_LENGTH) return false;
    const parsed = stored === null ? null : parse(stored);
    if (parsed === null) {
        dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
        const dummy = parse(await dummyHash)!;
        await derive(password, dummy.salt, dummy.cost, dummy.key.length);
        return false;
    }
    const candidate = await derive(password, parsed.salt, parsed.cost, parsed.key.length);
    return crypto.timingSafeEqual(candidate, parsed.key);
}
