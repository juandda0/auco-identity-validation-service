import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGO_URI: z.string().min(1).default('mongodb://localhost:27017'),
  MONGO_DB: z.string().min(1).default('auco'),
  // Only set for DynamoDB Local. Leave empty to use the real AWS endpoint.
  DYNAMO_ENDPOINT: z.url().optional(),
  DYNAMO_REGION: z.string().min(1).default('us-east-1'),
  DYNAMO_TABLE: z.string().min(1).default('audit_events'),
  COUNTRIES_API_URL: z.url().default('https://api.worldbank.org/v2'),
  COUNTRIES_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
