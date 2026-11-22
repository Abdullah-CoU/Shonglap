import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/shonglap_test'),
  JWT_SECRET: z.string().default('test-secret-key'),
  TRANSCRIBE_PROVIDER: z.enum(['openai', 'whispercpp', 'sidecar']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  WHISPERCPP_MODEL: z.string().default('medium'),
  WHISPER_SIDECAR_URL: z.string().default('http://localhost:8000'),
  WHISPER_PROMPT: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  MOCK_LLM: z.string().transform((val) => val === 'true').default('true'),
  MOCK_TRANSCRIPTION: z.string().transform((val) => val === 'true').default('true'),
  CORS_ORIGIN: z.string().default('http://localhost:5173')
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
