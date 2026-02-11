import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/creators
 * List all active creators. Public endpoint.
 */
export async function GET() {
  const creators = await db
    .select({
      id: schema.creators.id,
      slug: schema.creators.slug,
      name: schema.creators.name,
      bio: schema.creators.bio,
      avatarUrl: schema.creators.avatarUrl,
      coverUrl: schema.creators.coverUrl,
      postCount: schema.creators.postCount,
      totalUnlocks: schema.creators.totalUnlocks,
      pipelineStatus: schema.creators.pipelineStatus,
      createdAt: schema.creators.createdAt,
    })
    .from(schema.creators)
    .where(eq(schema.creators.pipelineStatus, 'ready'));

  return NextResponse.json({ creators });
}
