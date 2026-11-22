import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;

    const user = await User.findOne({ email }).populate('department').lean();
    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid credentials', status: 401 } });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: { message: 'Invalid credentials', status: 401 } });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, department: user.department?._id },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
          ? { id: user.department._id, nameEn: user.department.nameEn, nameBn: user.department.nameBn }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
