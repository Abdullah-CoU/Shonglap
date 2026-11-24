import rateLimit from 'express-rate-limit';

const standard = {
  standardHeaders: true,
  legacyHeaders: false,
};

/** Expensive media/AI endpoints — keeps cost and abuse bounded. */
export const uploadLimiter = rateLimit({
  ...standard,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: { message: 'Too many media requests. Please wait and try again.', status: 429 } },
});

export const aiDraftLimiter = rateLimit({
  ...standard,
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: { message: 'Too many report requests. Please wait and try again.', status: 429 } },
});

export const searchLimiter = rateLimit({
  ...standard,
  windowMs: 60 * 1000,
  max: 60,
  message: { error: { message: 'Too many search requests. Please slow down.', status: 429 } },
});

export const adminLimiter = rateLimit({
  ...standard,
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: { message: 'Too many admin requests. Please slow down.', status: 429 } },
});
