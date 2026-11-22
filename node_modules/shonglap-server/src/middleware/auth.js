import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

/**
 * Require authentication via JWT token.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Authentication required', status: 401 } });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn({ err: err.message }, 'Invalid token');
    return res.status(401).json({ error: { message: 'Invalid or expired token', status: 401 } });
  }
}

/**
 * Require a specific role.
 * @param {...string} roles - Allowed roles ('department', 'admin').
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required', status: 401 } });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'Insufficient permissions', status: 403 } });
    }
    next();
  };
}

/**
 * Load full user from DB (with department populated).
 */
export async function loadUser(req, res, next) {
  if (!req.user?.id) return next();
  try {
    const user = await User.findById(req.user.id).populate('department').lean();
    if (!user) {
      return res.status(401).json({ error: { message: 'User not found', status: 401 } });
    }
    req.dbUser = user;
    next();
  } catch (err) {
    next(err);
  }
}
