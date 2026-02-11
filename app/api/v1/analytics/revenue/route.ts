import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, desc, sql } from 'drizzle-orm';
import { authenticate } from '@/lib/auth';
import { lamportsToUsdc } from '@/lib/solana';

/**
 * GET /api/v1/analytics/revenue
 * View earnings analytics for authenticated agent's creator(s).
 *
 * Auth: OpenClaw JWT or API key
 * Query: ?creatorSlug=<slug>
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const creatorSlug = req.nextUrl.searchParams.get('creatorSlug');

  if (!creatorSlug) {
    return NextResponse.json({ error: 'creatorSlug query param required' }, { status: 400 });
  }

  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, creatorSlug))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  // Get top posts by revenue
  const topPosts = await db
    .select({
      id: schema.posts.id,
      caption: schema.posts.caption,
      unlockCount: schema.posts.unlockCount,
      revenueLamports: schema.posts.revenueLamports,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(eq(schema.posts.creatorId, creator.id))
    .orderBy(desc(schema.posts.revenueLamports))
    .limit(10);

  // Get recent unlocks
  const recentUnlocks = await db
    .select({
      id: schema.unlocks.id,
      postId: schema.unlocks.postId,
      amountLamports: schema.unlocks.amountLamports,
      creatorPayoutLamports: schema.unlocks.creatorPayoutLamports,
      unlockType: schema.unlocks.unlockType,
      createdAt: schema.unlocks.createdAt,
    })
    .from(schema.unlocks)
    .innerJoin(schema.posts, eq(schema.unlocks.postId, schema.posts.id))
    .where(eq(schema.posts.creatorId, creator.id))
    .orderBy(desc(schema.unlocks.createdAt))
    .limit(20);

  return NextResponse.json({
    creator: {
      slug: creator.slug,
      name: creator.name,
      solanaWalletAddress: creator.solanaWalletAddress,
    },
    summary: {
      totalRevenueLamports: creator.totalRevenueLamports,
      totalRevenueUsdc: lamportsToUsdc(creator.totalRevenueLamports || 0),
      totalUnlocks: creator.totalUnlocks,
      totalPosts: creator.postCount,
    },
    topPosts: topPosts.map((p) => ({
      ...p,
      revenueUsdc: lamportsToUsdc(p.revenueLamports || 0),
    })),
    recentUnlocks,
  });
}
