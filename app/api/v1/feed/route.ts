import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/v1/feed
 * Public content feed — latest published posts across all creators.
 */
export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 20, 50);
  const offset = Number(req.nextUrl.searchParams.get('offset')) || 0;

  const posts = await db
    .select({
      id: schema.posts.id,
      creatorId: schema.posts.creatorId,
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
    .where(eq(schema.posts.status, 'published'))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(limit)
    .offset(offset);

  // Attach creator info
  const creatorIds = [...new Set(posts.map((p) => p.creatorId).filter(Boolean))];
  const creators = creatorIds.length
    ? await db
        .select({
          id: schema.creators.id,
          slug: schema.creators.slug,
          name: schema.creators.name,
          avatarUrl: schema.creators.avatarUrl,
        })
        .from(schema.creators)
    : [];

  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  const feed = posts.map((post) => ({
    ...post,
    creator: creatorMap.get(post.creatorId!) || null,
  }));

  return NextResponse.json({ posts: feed });
}
