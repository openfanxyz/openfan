import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Solana
  SOLANA_RPC_URL: z.string().url().optional(),
  USDC_MINT_ADDRESS: z.string().min(32).optional(),
  OPENFAN_PLATFORM_WALLET: z.string().min(32),

  // R2 Storage
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_ORIGINALS: z.string().default('openfan-originals'),
  R2_BUCKET_PREVIEWS: z.string().default('openfan-previews'),
  R2_PUBLIC_URL: z.string().optional(),

  // RunPod (platform)
  RUNPOD_PLATFORM_ENDPOINT: z.string().url().optional(),
  RUNPOD_PLATFORM_API_KEY: z.string().optional(),

  // Auth
  OPENCLAW_JWKS_URL: z.string().url().optional(),
  OPENCLAW_ISSUER: z.string().optional(),
  OPENCLAW_AUDIENCE: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),

  // Buffer (social)
  BUFFER_ACCESS_TOKEN: z.string().optional(),
  BUFFER_PROFILE_IDS: z.string().optional(),

  // App
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
});

let _env: z.infer<typeof envSchema> | null = null;
let _warned = false;

function getEnv() {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    if (!_warned) {
      _warned = true;
      console.warn('[env] Missing environment variables:',
        result.error.issues.map((i) => i.path.join('.')).join(', '));
    }
    return process.env as unknown as z.infer<typeof envSchema>;
  }
  _env = result.data;
  return _env;
}

export const env = new Proxy({} as z.infer<typeof envSchema>, {
  get(_, prop: string) {
    return getEnv()[prop as keyof z.infer<typeof envSchema>];
  },
});
