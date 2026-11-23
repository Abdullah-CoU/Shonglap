import express from 'express';
import multer from 'multer';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { unlink, copyFile, mkdir } from 'fs/promises';
import { convertToWav, cleanupTempFiles } from '../utils/audio.js';
import { transcribeAudio } from '../services/transcription/index.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'video/webm'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|m4a|mp3|wav|ogg|mp4)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format'));
    }
  },
});

router.post('/', upload.single('audio'), async (req, res, next) => {
  const tempFiles = [];
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No audio file provided', status: 400 } });
    }

    tempFiles.push(req.file.path);

    // Save original audio to /uploads with UUID filename
    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const originalExt = extname(req.file.originalname) || '.webm';
    const savedName = `${randomUUID()}${originalExt}`;
    const savedPath = join(uploadsDir, savedName);
    await copyFile(req.file.path, savedPath);
    const publicPath = `/uploads/${savedName}`;

    // Gemini accepts common audio formats directly; skip WAV conversion for speed.
    const skipWav = env.MOCK_TRANSCRIPTION || env.TRANSCRIBE_PROVIDER === 'gemini';
    let transcribePath = savedPath;
    if (!skipWav) {
      const wavPath = await convertToWav(req.file.path);
      tempFiles.push(wavPath);
      transcribePath = wavPath;
    }

    // Transcribe
    const language = req.body.language || 'bn';
    const result = await transcribeAudio(transcribePath, { language });

    res.status(200).json({
      transcript: result.text,
      language: result.language,
      duration: result.duration,
      segments: result.segments,
      audioPath: publicPath,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Transcription failed');
    next(err);
  } finally {
    await cleanupTempFiles(tempFiles);
  }
});

export default router;
