import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

/**
 * Require authentication via JWT token. Verifies signature and loads the
 * user from DB so role/department always come from the source of truth.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Authentication required', status: 401 } });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;

    // Reject tokens for deleted users
    const user = await User.findById(decoded.id).populate('department').lean();
    if (!user) {
      return res.status(401).json({ error: { message: 'User no longer exists', status: 401 } });
    }
    req.dbUser = user;
    next();
  } catch (err) {
    logger.warn({ err: err.message }, 'Invalid token');
    return res.status(401).json({ error: { message: 'Invalid or expired token', status: 401 } });
  }
}

/**
 * Require a specific role. Uses the DB-loaded user when available.
 * Must be used AFTER requireAuth.
 * @param {...string} roles - Allowed roles ('department', 'admin').
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.dbUser?.role || req.user?.role;
    if (!role) {
      return res.status(401).json({ error: { message: 'Authentication required', status: 401 } });
    }
    if (!roles.includes(role)) {
      return res.status(403).json({ error: { message: 'Insufficient permissions', status: 403 } });
    }
    next();
  };
}

/**
 * Ensure a department user has a department assigned.
 * Prevents a misconfigured account from seeing all complaints.
 */
export function requireDepartment(req, res, next) {
  const role = req.dbUser?.role || req.user?.role;
  if (role === 'department' && !req.dbUser?.department) {
    return res.status(403).json({ error: { message: 'No department assigned to this account', status: 403 } });
  }
  next();
}

/**
 * Backwards-compatible alias — requireAuth now loads the user itself,
 * so this is a no-op kept for existing routes.
 */
export async function loadUser(req, res, next) {
  next();
}

/**
 * Scoping helper for complaint queries. Returns a Mongoose filter fragment
 * that restricts department users to their own department.
 */
export function departmentScope(user) {
  if (user?.role === 'department') {
    if (!user.department) return null; // caller should deny
    return { 'routing.department': user.department._id };
  }
  return {};
}
