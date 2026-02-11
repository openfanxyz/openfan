import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { authenticate } from '@/lib/auth';

/**
 * GET /api/v1/creators/:slug
 * Get creator profile. Public endpoint.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [creator] = await db
    .select({
      id: schema.creators.id,
      slug: schema.creators.slug,
      name: schema.creators.name,
      bio: schema.creators.bio,
      avatarUrl: schema.creators.avatarUrl,
      coverUrl: schema.creators.coverUrl,
      solanaWalletAddress: schema.creators.solanaWalletAddress,
      postCount: schema.creators.postCount,
      totalUnlocks: schema.creators.totalUnlocks,
      pipelineStatus: schema.creators.pipelineStatus,
      createdAt: schema.creators.createdAt,
    })
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  return NextResponse.json({ creator });
}

/**
 * PATCH /api/v1/creators/:slug
 * Update creator profile. Auth required (owner).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const body = await req.json();

  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  // Build update object from allowed fields
  const allowedFields = ['name', 'bio', 'avatarUrl', 'coverUrl', 'pipelineStatus'] as const;
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  await db
    .update(schema.creators)
    .set(updates)
    .where(eq(schema.creators.id, creator.id));

  return NextResponse.json({ success: true, slug });
}
