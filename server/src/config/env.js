import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const boolFromString = (defaultValue) => z.string()
  .transform((val) => val === 'true')
  .default(defaultValue ? 'true' : 'false');

const isProduction = process.env.NODE_ENV === 'production';

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/shonglap_test'),
  // Never allow a predictable JWT secret in production.
  JWT_SECRET: isProduction
    ? z.string().min(32, 'JWT_SECRET must be at least 32 characters in production')
    : z.string().default('test-secret-key'),
  TRANSCRIBE_PROVIDER: z.enum(['openai', 'whispercpp', 'sidecar', 'gemini']).default('openai'),
  // Demo/dev remain deterministic; production never mocks by default.
  MOCK_LLM: boolFromString(!isProduction),
  MOCK_TRANSCRIPTION: boolFromString(!isProduction),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  WHISPERCPP_MODEL: z.string().default('medium'),
  WHISPER_SIDECAR_URL: z.string().default('http://localhost:8000'),
  WHISPER_PROMPT: z.string().optional(),
  // Gemini is configured explicitly instead of being read ad-hoc from process.env.
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-lite-latest'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Signed, expiring upload URLs can be enabled in production (off in dev for existing flows).
  PROTECT_UPLOADS: boolFromString(false),
  UPLOAD_URL_TTL_SECONDS: z.string().default('3600'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
