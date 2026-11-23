import { z } from 'zod';

/**
 * Zod validation middleware factory.
 * @param {z.ZodSchema} schema - Zod schema to validate against.
 * @param {'body'|'query'|'params'} [source='body'] - Request property to validate.
 * @returns {Function} Express middleware.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source] ?? {};
    const result = schema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({
        error: {
          message: `Invalid ${source} input`,
          status: 400,
          details: errors,
        },
      });
    }

    if (source === 'body') req.validated = result.data;
    else if (source === 'query') req.validatedQuery = result.data;
    else if (source === 'params') req.validatedParams = result.data;
    next();
  };
}

export const validateBody = (schema) => validate(schema, 'body');
export const validateQuery = (schema) => validate(schema, 'query');
export const validateParams = (schema) => validate(schema, 'params');