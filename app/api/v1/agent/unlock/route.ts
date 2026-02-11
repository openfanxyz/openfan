import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { authenticate } from '@/lib/auth';
import { getUnlockedImageUrl } from '@/lib/image';

/**
 * POST /api/v1/agent/unlock
 * Free promo unlock — allows an authenticated agent to unlock images.
 * Used for promotional content, bot-to-bot gifting, etc.
 *
 * Auth: OpenClaw JWT or API key
 * Body: { postId, reason? }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { postId, reason } = await req.json();

  if (!postId) {
    return NextResponse.json({ error: 'postId required' }, { status: 400 });
  }

  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (!post.originalKey) {
    return NextResponse.json({ error: 'Post has no image' }, { status: 400 });
  }

  // Record agent unlock (no payment)
  const unlockId = randomUUID();
  await db.insert(schema.unlocks).values({
    id: unlockId,
    postId,
    agentId: auth.agentId || 'api-key-user',
    unlockType: 'promo',
    amountLamports: 0,
    platformFeeLamports: 0,
    creatorPayoutLamports: 0,
  });

  // Increment unlock count
  await db
    .update(schema.posts)
    .set({
      unlockCount: sql`${schema.posts.unlockCount} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.posts.id, postId));

  // Return signed image URL
  const imageUrl = await getUnlockedImageUrl(post.originalKey);

  return NextResponse.json({
    success: true,
    unlockId,
    imageUrl,
    reason: reason || 'agent_promo',
  });
}
