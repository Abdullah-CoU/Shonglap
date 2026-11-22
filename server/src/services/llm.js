import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Shared Claude client. All services that need LLM calls should use
 * `callClaudeJson` instead of instantiating the SDK directly.
 */
let _client = null;

const getClient = () => {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
};

/**
 * Strip markdown code fences from a string if present.
 * @param {string} text
 * @returns {string}
 */
const stripFences = (text) => {
  let trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return trimmed.trim();
};

/**
 * Call Claude and parse the response as JSON, validated against a Zod schema.
 * Retries once on parse/validation failure.
 *
 * @param {Object} params
 * @param {string} params.system - System prompt
 * @param {Array<{role: string, content: string}>} params.messages - Chat messages
 * @param {import('zod').ZodSchema} params.schema - Zod schema to validate against
 * @param {Function} [params.mockFn] - Deterministic mock function for MOCK_LLM mode. Receives {system, messages} and returns a raw object.
 * @returns {Promise<any>} - Parsed and validated data
 */
export async function callClaudeJson({ system, messages, schema, mockFn }) {
  // MOCK_LLM mode: return deterministic output
  if (env.MOCK_LLM) {
    if (typeof mockFn === 'function') {
      const raw = mockFn({ system, messages });
      return schema.parse(raw);
    }
    // Fallback: try to parse an empty object (schema must have defaults)
    return schema.parse({});
  }

  const client = getClient();
  const model = env.ANTHROPIC_MODEL;

  const attempt = async () => {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system,
      messages,
    });

    const textBlock = response.content?.find((b) => b.type === 'text');
    const rawText = textBlock?.text ?? '';
    const cleaned = stripFences(rawText);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Failed to parse JSON from LLM response: ${e.message}\nRaw: ${rawText}`);
    }

    return schema.parse(parsed);
  };

  try {
    return await attempt();
  } catch (firstError) {
    logger.warn({ err: firstError.message }, 'First LLM attempt failed, retrying once');
    try {
      return await attempt();
    } catch (secondError) {
      logger.error({ err: secondError.message }, 'Second LLM attempt failed');
      throw secondError;
    }
  }
}
