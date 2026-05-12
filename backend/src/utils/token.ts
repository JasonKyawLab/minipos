// Path: backend/src/utils/token.ts
// Purpose: Cryptographically secure token generation.
// Using crypto.randomBytes (Node built-in) — no external dep.
// 32 bytes = 256 bits of entropy. Cannot be brute-forced.

import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';

/**
 * Generates a cryptographically secure session token.
 * 32 random bytes → 64 hex characters.
 * This is stored in the HttpOnly cookie and in the DB.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generates a human-readable emergency code.
 * 4 bytes → 8 uppercase alphanumeric characters.
 * Example: "A3F7K2M9"
 * Short enough to type manually, hard enough to guess
 * within a 5-minute window.
 */
export function generateEmergencyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map(b => chars[b % chars.length])
    .join('');
}

/**
 * Hash a code for storage. Never store codes in plaintext.
 * Cost factor 10 is intentionally lower than passwords
 * because emergency codes are short-lived and bcrypt at
 * higher cost would slow down a legitimate emergency.
 */
export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}