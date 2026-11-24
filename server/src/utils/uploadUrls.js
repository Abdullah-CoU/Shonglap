import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env.js';

/**
 * Signed, expiring URLs for uploaded media. When PROTECT_UPLOADS is enabled,
 * /uploads/* requests must carry a valid `t` token; otherwise files are served
 * as before (local demo/dev behavior is unchanged).
 */

const isProtected = () => env.PROTECT_UPLOADS || process.env.PROTECT_UPLOADS === 'true';

const ttlSeconds = () => {
  const parsed = Number(env.UPLOAD_URL_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
};

const sign = (path, expires) => createHmac('sha256', env.JWT_SECRET)
  .update(`${path}:${expires}`)
  .digest('hex');

/** @returns {string} URL path with a signed token appended. */
export function signUploadPath(path) {
  if (!isProtected() || !path) return path;
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds();
  const token = `${expires}.${sign(path, expires)}`;
  return `${path}${path.includes('?') ? '&' : '?'}t=${token}`;
}

/** @returns {boolean} whether the token is valid for the requested path. */
export function verifyUploadToken(path, token) {
  if (!isProtected()) return true;
  if (!token || typeof token !== 'string') return false;
  const [expiresRaw, signature] = token.split('.');
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(path, expires);
  if (!signature || signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
