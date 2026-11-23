import express from 'express';
import { join } from 'path';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
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

// Serve uploaded files (photos, audio)
app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

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
  const status = err.status || 500;
  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      status,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

export default app;
