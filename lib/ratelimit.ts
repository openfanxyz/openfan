import { NextResponse } from 'next/server';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store — works within warm serverless instances.
// For distributed rate limiting, upgrade to Upstash Redis.
const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

/**
 * Extract client identifier from request.
 * Uses x-forwarded-for (Vercel sets this), falls back to x-real-ip.
 */
function getClientId(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Check rate limit for a request. Returns a 429 NextResponse if limited, or null if allowed.
 *
 * Usage:
 * ```ts
 * const limited = checkRateLimit(req, 'generate', { maxRequests: 10, windowMs: 60_000 });
 * if (limited) return limited;
 * ```
 */
export function checkRateLimit(
  req: Request,
  endpoint: string,
  config: RateLimitConfig
): NextResponse | null {
  cleanup();

  const clientId = getClientId(req);
  const key = `${endpoint}:${clientId}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}
