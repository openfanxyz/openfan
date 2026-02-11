import { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { db, schema } from '@/db';
import { eq, and } from 'drizzle-orm';
import { createHash } from 'crypto';

// ─── Types ───────────────────────────────────────────────────

interface OpenClawJwtPayload {
  sub: string; // agent ID
  org?: string; // org ID
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

interface AuthResult {
  type: 'jwt' | 'apikey';
  agentId?: string;
  operatorId?: string;
  orgId?: string;
}

// ─── JWKS ────────────────────────────────────────────────────

const OPENCLAW_JWKS_URL = process.env.OPENCLAW_JWKS_URL || 'https://auth.openclaw.ai/.well-known/jwks.json';
const OPENCLAW_ISSUER = process.env.OPENCLAW_ISSUER || 'https://auth.openclaw.ai';
const OPENCLAW_AUDIENCE = process.env.OPENCLAW_AUDIENCE || 'openfan';

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(OPENCLAW_JWKS_URL));
  }
  return jwksCache;
}

// ─── JWT Verification ────────────────────────────────────────

async function verifyOpenClawJwt(token: string): Promise<OpenClawJwtPayload> {
  const jwks = getJWKS();
  const { payload } = await jwtVerify(token, jwks, {
    issuer: OPENCLAW_ISSUER,
    audience: OPENCLAW_AUDIENCE,
  });
  return payload as unknown as OpenClawJwtPayload;
}

// ─── API Key Verification ────────────────────────────────────

async function verifyApiKey(key: string): Promise<{ operatorId: string } | null> {
  const keyHash = createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 8);

  const [apiKey] = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.keyHash, keyHash),
        eq(schema.apiKeys.keyPrefix, prefix),
        eq(schema.apiKeys.isActive, true)
      )
    )
    .limit(1);

  if (!apiKey) return null;

  // Check expiry
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return null;
  }

  // Update last used
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(schema.apiKeys.id, apiKey.id));

  return { operatorId: apiKey.operatorId! };
}

// ─── Middleware ───────────────────────────────────────────────

/**
 * Authenticate a request using OpenClaw JWT or API key.
 * Returns auth context or null if unauthorized.
 */
export async function authenticate(req: NextRequest): Promise<AuthResult | null> {
  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-api-key');

  // Try JWT (Bearer token)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = await verifyOpenClawJwt(token);
      return {
        type: 'jwt',
        agentId: payload.sub,
        orgId: payload.org,
      };
    } catch {
      return null;
    }
  }

  // Try API key
  if (apiKeyHeader) {
    const result = await verifyApiKey(apiKeyHeader);
    if (result) {
      return {
        type: 'apikey',
        operatorId: result.operatorId,
      };
    }
    return null;
  }

  return null;
}

/**
 * Verify a wallet signature for consumer auth (fan unlocks).
 * The client signs a message with their Solana keypair.
 */
export function verifyWalletAuth(req: NextRequest): string | null {
  const walletAddress = req.headers.get('x-wallet-address');
  // In production, verify a signed nonce here.
  // For MVP, trust the wallet address header.
  return walletAddress;
}
