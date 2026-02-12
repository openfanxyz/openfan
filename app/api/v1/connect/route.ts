import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { authenticate } from '@/lib/auth';
import { generatePersonaConfig } from '@/lib/persona';
import { announceCreator } from '@/lib/buffer';
import { checkRateLimit } from '@/lib/ratelimit';
import { z } from 'zod';

const connectSchema = z.object({
  soulMd: z.string().min(1).max(50000),
  visualDescription: z.string().max(5000).optional(),
  solanaWalletAddress: z.string().min(32).max(44),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  contentRating: z.enum(['sfw', 'nsfw']).optional(),
  runpodEndpoint: z.string().url().optional(),
  runpodApiKey: z.string().max(200).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});

export const maxDuration = 30;

/**
 * POST /api/v1/connect
 * Connect an OpenClaw agent to OpenFan.
 * Creates operator (if needed), agent connection, and creator profile.
 *
 * Auth: OpenClaw JWT or API key
 * Body: { soulMd, visualDescription, solanaWalletAddress, slug, name, contentRating?, runpodEndpoint?, runpodApiKey? }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = checkRateLimit(req, 'connect', { maxRequests: 5, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json();
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const {
    soulMd,
    visualDescription,
    solanaWalletAddress,
    slug,
    name,
    contentRating,
    runpodEndpoint,
    runpodApiKey,
    bio,
    avatarUrl,
  } = parsed.data;

  // Check slug uniqueness
  const [existing] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
  }

  // Create or find operator
  let operatorId: string;
  if (auth.operatorId) {
    operatorId = auth.operatorId;
  } else {
    operatorId = randomUUID();
    await db.insert(schema.operators).values({
      id: operatorId,
      name: name,
      openclawOrgId: auth.orgId,
      solanaWalletAddress,
    });
  }

  // Generate persona config from SOUL.md
  let personaConfig = null;
  try {
    personaConfig = await generatePersonaConfig({
      soulMd,
      visualDescription,
      contentRating: contentRating || 'sfw',
    });
  } catch (error) {
    // Non-fatal — creator can update persona later
    console.error('[connect] Persona generation failed:', error instanceof Error ? error.message : error);
  }

  // Create creator profile
  const creatorId = randomUUID();
  await db.insert(schema.creators).values({
    id: creatorId,
    operatorId,
    slug,
    name,
    bio: bio || null,
    avatarUrl: avatarUrl || null,
    solanaWalletAddress,
    personaConfig: personaConfig as typeof schema.creators.$inferInsert['personaConfig'],
    runpodEndpointUrl: runpodEndpoint || null,
    pipelineStatus: personaConfig ? 'ready' : 'draft',
  });

  // Create agent connection
  const connectionId = randomUUID();
  await db.insert(schema.agentConnections).values({
    id: connectionId,
    operatorId,
    openclawAgentId: auth.agentId || 'api-key-user',
    soulMd,
    visualDescription: visualDescription || null,
    solanaWalletAddress,
    runpodEndpointUrl: runpodEndpoint || null,
    runpodApiKey: runpodApiKey || null,
    creatorId,
    connectionStatus: 'active',
  });

  // Announce on social media (non-blocking)
  announceCreator({ name, slug, bio });

  return NextResponse.json({
    success: true,
    creator: {
      id: creatorId,
      slug,
      name,
      solanaWalletAddress,
      pipelineStatus: personaConfig ? 'ready' : 'draft',
      personaConfig,
      runpodEndpoint: runpodEndpoint || null,
    },
    connection: {
      id: connectionId,
      status: 'active',
    },
  }, { status: 201 });
}

/**
 * GET /api/v1/connect/status
 * Check agent's connection status.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agentId = auth.agentId || 'api-key-user';

  const [connection] = await db
    .select()
    .from(schema.agentConnections)
    .where(eq(schema.agentConnections.openclawAgentId, agentId))
    .limit(1);

  if (!connection) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    connectionId: connection.id,
    creatorId: connection.creatorId,
    status: connection.connectionStatus,
    hasRunpod: !!connection.runpodEndpointUrl,
  });
}
