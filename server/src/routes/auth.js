import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { verifyPassword } from '../utils/password.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Brute-force protection: 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Try again later.', status: 429 } },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const toPublicUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department
    ? { id: u.department._id, nameEn: u.department.nameEn, nameBn: u.department.nameBn }
    : null,
});

const TOKEN_COOKIE = 'token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
});

const signToken = (user) => jwt.sign(
  { id: user._id, email: user.email, role: user.role, department: user.department?._id },
  env.JWT_SECRET,
  { expiresIn: '24h' }
);

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    const user = await User.findOne({ email }).populate('department').lean();
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid credentials', status: 401 } });
    }

    const valid = await verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) {
      return res.status(401).json({ error: { message: 'Invalid credentials', status: 401 } });
    }

    // Department accounts must have a department assigned
    if (user.role === 'department' && !user.department) {
      return res.status(403).json({ error: { message: 'No department assigned to this account', status: 403 } });
    }

    logger.info({ email, role: user.role, department: user.department?.nameEn }, 'User logged in');

    const token = signToken(user);
    res.cookie(TOKEN_COOKIE, token, cookieOptions());
    res.status(200).json({ token, user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — verify current session
router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: toPublicUser(req.dbUser) });
});

// POST /api/auth/logout — clear auth cookie
router.post('/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, { ...cookieOptions(), maxAge: 0 });
  res.status(200).json({ ok: true });
});

export default router;
