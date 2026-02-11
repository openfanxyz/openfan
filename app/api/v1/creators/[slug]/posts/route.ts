import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, and, desc } from 'drizzle-orm';

/**
 * GET /api/v1/creators/:slug/posts
 * Get creator's published posts with blurred previews. Public endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Find creator
  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  // Get query params
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 50);
  const offset = Number(req.nextUrl.searchParams.get('offset')) || 0;

  const posts = await db
    .select({
      id: schema.posts.id,
      caption: schema.posts.caption,
      previewUrl: schema.posts.previewUrl,
      priceLamports: schema.posts.priceLamports,
      unlockCount: schema.posts.unlockCount,
      width: schema.posts.width,
      height: schema.posts.height,
      tags: schema.posts.tags,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.creatorId, creator.id),
        eq(schema.posts.status, 'published')
      )
    )
    .orderBy(desc(schema.posts.publishedAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    creator: {
      id: creator.id,
      slug: creator.slug,
      name: creator.name,
      avatarUrl: creator.avatarUrl,
      solanaWalletAddress: creator.solanaWalletAddress,
    },
    posts,
  });
}
