import express from 'express';
import multer from 'multer';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { saveOriginal } from '../services/vision.js';
import { analyzePhoto } from '../services/vision.js';
import { cleanupTempFiles } from '../utils/audio.js';
import { applyPrivacyBlur } from '../utils/privacy.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported image type. Allowed: jpg, png, webp'));
    }
  },
});

router.post('/', upload.single('photo'), async (req, res, next) => {
  const tempFiles = [];
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No photo file provided', status: 400 } });
    }

    tempFiles.push(req.file.path);

    // Save original under /uploads with UUID filename
    const savedPath = await saveOriginal(req.file.path, req.file.originalname);

    // Apply privacy blur if requested
    const shouldBlur = req.body.blur === 'true' || req.body.blur === true;
    let finalPath = savedPath;
    if (shouldBlur) {
      const blurredPath = savedPath.replace(/(\.\w+)$/, '_blurred$1');
      await applyPrivacyBlur(savedPath, blurredPath);
      finalPath = blurredPath;
    }

    // Analyze
    const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 2000) : '';
    const result = await analyzePhoto(finalPath, { text });

    res.status(200).json({
      ...result,
      savedPath: finalPath,
      blurred: shouldBlur,
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Photo analysis failed');
    next(err);
  } finally {
    await cleanupTempFiles(tempFiles);
  }
});

export default router;
