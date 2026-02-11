import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/posts/:id
 * Get post detail. Public endpoint (shows blurred preview).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [post] = await db
    .select({
      id: schema.posts.id,
      creatorId: schema.posts.creatorId,
      status: schema.posts.status,
      caption: schema.posts.caption,
      previewUrl: schema.posts.previewUrl,
      priceLamports: schema.posts.priceLamports,
      unlockCount: schema.posts.unlockCount,
      width: schema.posts.width,
      height: schema.posts.height,
      tags: schema.posts.tags,
      generationType: schema.posts.generationType,
      publishedAt: schema.posts.publishedAt,
      createdAt: schema.posts.createdAt,
    })
    .from(schema.posts)
    .where(eq(schema.posts.id, id))
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Get creator info
  let creator = null;
  if (post.creatorId) {
    const [c] = await db
      .select({
        id: schema.creators.id,
        slug: schema.creators.slug,
        name: schema.creators.name,
        avatarUrl: schema.creators.avatarUrl,
        solanaWalletAddress: schema.creators.solanaWalletAddress,
      })
      .from(schema.creators)
      .where(eq(schema.creators.id, post.creatorId))
      .limit(1);
    creator = c || null;
  }

  return NextResponse.json({ post, creator });
}
