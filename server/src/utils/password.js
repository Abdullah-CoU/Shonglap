import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import bcrypt from 'bcrypt';

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_COST = 10;

/**
 * Hash a password with an explicit random salt using scrypt.
 * Returns `{ hash, salt }` to store separately on the user record.
 *
 * @param {string} password - Plaintext password.
 * @param {number} [cost=10] - Kept for API parity (scrypt uses a fixed cost).
 * @returns {Promise<{hash: string, salt: string}>}
 */
export async function hashPassword(password, cost = DEFAULT_COST) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return { hash: derived.toString('hex'), salt };
}

/**
 * Verify a plaintext password against a stored hash + salt.
 * Supports both scrypt (salt field present) and legacy bcrypt hashes.
 *
 * @param {string} password - Plaintext password.
 * @param {string} storedHash - Stored hash.
 * @param {string} [salt] - Explicit salt (scrypt). Absent means legacy bcrypt.
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash, salt) {
  if (!storedHash) return false;

  // Legacy bcrypt hash (starts with $2a$, $2b$, $2y$)
  if (!salt || /^\$2[aby]\$/.test(storedHash)) {
    try {
      return await bcrypt.compare(password, storedHash);
    } catch {
      return false;
    }
  }

  try {
    const derived = await scrypt(password, salt, KEY_LENGTH);
    const stored = Buffer.from(storedHash, 'hex');
    if (stored.length !== derived.length) return false;
    return timingSafeEqual(stored, derived);
  } catch {
    return false;
  }
}

/**
 * Convenience: hash a password and return only the hash string.
 * Useful where the schema has no separate salt field.
 */
export async function hashPasswordString(password) {
  const { hash } = await hashPassword(password);
  return hash;
}
