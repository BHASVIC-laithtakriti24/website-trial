'use strict';
/* ---------------------------------------------------------------------
   Crypto primitives. Deliberately dependency-free: everything here is
   node:crypto.

   Passwords are stored as scrypt hashes with a per-user random salt.
   A stolen database therefore does not hand an attacker any passwords —
   scrypt is memory-hard, so brute-forcing is expensive even on GPUs.
   ------------------------------------------------------------------ */

const crypto = require('node:crypto');

const SCRYPT_N = 16384;   // CPU/memory cost
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 64 * 1024 * 1024
  });
  return ['scrypt', SCRYPT_N, SCRYPT_r, SCRYPT_p, salt.toString('base64'), key.toString('base64')].join('$');
}

function verifyPassword(plain, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(String(plain), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    });
    // Constant-time compare — never leak how much of the hash matched.
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Dummy verify, used on unknown emails so login timing is identical
 *  whether or not the account exists (blocks user enumeration). */
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));
function fakeVerify() { verifyPassword('x', DUMMY_HASH); }

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/* ------------------------------ cookies ------------------------------ */

function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

function serializeCookie(name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) bits.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.httpOnly) bits.push('HttpOnly');
  if (opts.secure) bits.push('Secure');
  bits.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return bits.join('; ');
}

module.exports = {
  hashPassword, verifyPassword, fakeVerify,
  randomToken, safeEqual,
  parseCookies, serializeCookie
};
