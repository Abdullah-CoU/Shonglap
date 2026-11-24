import express from 'express';
import { join } from 'path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import { verifyUploadToken } from './utils/uploadUrls.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import transcribeRouter from './routes/transcribe.js';
import analyzePhotoRouter from './routes/analyze-photo.js';
import complaintsRouter from './routes/complaints.js';
import authRouter from './routes/auth.js';
import departmentsRouter from './routes/departments.js';
import adminRouter from './routes/admin.js';
import analyticsRouter from './routes/analytics.js';
import notificationsRouter from './routes/notifications.js';
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(pinoHttp({ logger }));

// Basic CSRF guard for cookie-authenticated mutating requests
app.use((req, res, next) => {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const hasCookieToken = Boolean(req.cookies?.token);
  const hasBearer = req.headers.authorization?.startsWith('Bearer ');
  if (unsafe && hasCookieToken && !hasBearer) {
    const origin = req.headers.origin;
    const allowed = String(env.CORS_ORIGIN).split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) {
      return res.status(403).json({ error: { message: 'Invalid request origin', status: 403 } });
    }
  }
  next();
});

// Serve uploaded files (photos, audio). In production, require signed expiring URLs.
app.use('/uploads', (req, res, next) => {
  if (!env.PROTECT_UPLOADS) return next();
  const path = req.originalUrl.split('?')[0];
  if (!verifyUploadToken(path, req.query.t)) {
    return res.status(403).json({ error: { message: 'Invalid or expired media link', status: 403 } });
  }
  next();
}, express.static(join(process.cwd(), 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
  },
}));

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), service: 'shonglap-server' });
});

// Transcription Route
app.use('/api/transcribe', transcribeRouter);
app.use('/api/analyze-photo', analyzePhotoRouter);
app.use('/api/complaints', complaintsRouter);
app.use('/api/auth', authRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/notifications', notificationsRouter);

// 404 Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({ error: { message: 'Not Found', status: 404 } });
});

// Global JSON Error Handler
app.use((err, req, res, next) => {
  logger.error(err);
  let status = err.status || 500;
  let message = err.message || 'Internal Server Error';
  let details;

  if (err.name === 'ZodError') {
    status = 400;
    message = 'Invalid input';
    details = err.issues?.map((i) => ({ path: i.path?.join('.'), message: i.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path || 'parameter'}: ${err.value}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors || {}).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid JSON body';
  }

  res.status(status).json({
    error: {
      message,
      status,
      ...(details ? { details } : {}),
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

export default app;
