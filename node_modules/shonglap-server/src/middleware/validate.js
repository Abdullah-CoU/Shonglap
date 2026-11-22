import { z } from 'zod';
import { logger } from '../utils/logger.js';

/**
 * Zod validation middleware factory.
 * @param {z.ZodSchema} schema - Zod schema to validate against.
 * @returns {Function} Express middleware.
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({
        error: { message: 'Validation failed', status: 400, details: errors },
      });
    }
    req.validated = result.data;
    next();
  };
}
