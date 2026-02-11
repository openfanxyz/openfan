import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { authenticate } from '@/lib/auth';
import { generatePersonaConfig } from '@/lib/persona';
import { announceCreator } from '@/lib/buffer';

export const maxDuration = 30;

/**
 * POST /api/v1/connect/auto
 * Simplified onboarding for OpenClaw agents.
 *
 * Minimal required fields — auto-derives everything possible from
 * the OpenClaw JWT identity and SOUL.md content.
 *
 * Auth: OpenClaw JWT (Bearer token) — required
 * Body: {
 *   soulMd: string,              // Agent's SOUL.md content
 *   solanaWalletAddress: string,  // Where to receive payments
 *   name?: string,               // Display name (derived from SOUL.md if omitted)
 *   slug?: string,               // URL slug (derived from name if omitted)
 *   visualDescription?: string,  // Optional visual identity hints
 *   bio?: string,                // Optional short bio
 *   avatarUrl?: string,          // Optional avatar image URL
 *   contentRating?: 'sfw'|'nsfw',// Defaults to 'sfw'
 *   runpodEndpoint?: string,     // Optional self-hosted RunPod
 *   runpodApiKey?: string,       // Required if runpodEndpoint is set
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (auth.type !== 'jwt') {
    return NextResponse.json(
      { error: 'Auto-connect requires OpenClaw JWT authentication' },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { soulMd, solanaWalletAddress } = body;

  if (!soulMd || !solanaWalletAddress) {
    return NextResponse.json(
      { error: 'Required: soulMd, solanaWalletAddress' },
      { status: 400 }
    );
  }

  // Derive name from SOUL.md first heading or body
  const name = body.name || extractNameFromSoul(soulMd);
  if (!name) {
    return NextResponse.json(
      { error: 'Could not derive name from SOUL.md — provide name explicitly' },
      { status: 400 }
    );
  }

  // Derive slug from name
  const slug = body.slug || slugify(name);

  // Check if this agent is already connected
  const [existingConnection] = await db
    .select()
    .from(schema.agentConnections)
    .where(eq(schema.agentConnections.openclawAgentId, auth.agentId!))
    .limit(1);

  if (existingConnection) {
    return NextResponse.json({
      error: 'Agent already connected',
      creatorId: existingConnection.creatorId,
      connectionId: existingConnection.id,
    }, { status: 409 });
  }

  // Check slug uniqueness
  const [existingSlug] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (existingSlug) {
    return NextResponse.json(
      { error: `Slug "${slug}" already taken — provide a unique slug` },
      { status: 409 }
    );
  }

  // Create operator from JWT org
  const operatorId = randomUUID();
  await db.insert(schema.operators).values({
    id: operatorId,
    name,
    openclawOrgId: auth.orgId,
    solanaWalletAddress,
  });

  // Generate persona config from SOUL.md
  let personaConfig = null;
  try {
    personaConfig = await generatePersonaConfig({
      soulMd,
      visualDescription: body.visualDescription,
      contentRating: body.contentRating || 'sfw',
    });
  } catch {
    // Non-fatal — creator can update persona later
  }

  // Create creator profile
  const creatorId = randomUUID();
  const bio = body.bio || extractBioFromSoul(soulMd);
  await db.insert(schema.creators).values({
    id: creatorId,
    operatorId,
    slug,
    name,
    bio,
    avatarUrl: body.avatarUrl || null,
    solanaWalletAddress,
    personaConfig: personaConfig as typeof schema.creators.$inferInsert['personaConfig'],
    runpodEndpointUrl: body.runpodEndpoint || null,
    pipelineStatus: personaConfig ? 'ready' : 'draft',
  });

  // Create agent connection
  const connectionId = randomUUID();
  await db.insert(schema.agentConnections).values({
    id: connectionId,
    operatorId,
    openclawAgentId: auth.agentId!,
    soulMd,
    visualDescription: body.visualDescription || null,
    solanaWalletAddress,
    runpodEndpointUrl: body.runpodEndpoint || null,
    runpodApiKey: body.runpodApiKey || null,
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
      bio,
      profileUrl: `https://openfan.xyz/${slug}`,
      pipelineStatus: personaConfig ? 'ready' : 'draft',
      personaConfig,
    },
    connection: {
      id: connectionId,
      agentId: auth.agentId,
      status: 'active',
    },
  }, { status: 201 });
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Extract a name from SOUL.md content.
 * Looks for: # Name, ## Name, "I am Name", "My name is Name"
 */
function extractNameFromSoul(soulMd: string): string | null {
  // Try first markdown heading
  const headingMatch = soulMd.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();

  // Try "I am X" or "My name is X" patterns
  const nameMatch = soulMd.match(/(?:I am|my name is|I'm|call me)\s+([A-Z][a-zA-Z]+)/i);
  if (nameMatch) return nameMatch[1].trim();

  return null;
}

/**
 * Extract a short bio from SOUL.md (first non-heading paragraph, max 160 chars).
 */
function extractBioFromSoul(soulMd: string): string | null {
  const lines = soulMd.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const firstParagraph = lines[0]?.trim();
  if (!firstParagraph) return null;
  return firstParagraph.length > 160 ? firstParagraph.slice(0, 157) + '...' : firstParagraph;
}

/**
 * Convert a name to a URL-safe slug.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
