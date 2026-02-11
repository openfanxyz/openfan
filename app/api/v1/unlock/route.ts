import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { verifyUnlockTransaction } from '@/lib/solana';
import { getUnlockedImageUrl } from '@/lib/image';

export const maxDuration = 30;

/**
 * POST /api/v1/unlock
 * Verify a Solana USDC transaction and unlock content.
 *
 * Auth: Wallet signature (x-wallet-address header)
 * Body: { postId, txSignature }
 *
 * Flow:
 * 1. Client builds + signs the unlock tx (90% creator, 10% platform)
 * 2. Client submits txSignature to this endpoint
 * 3. We verify on-chain: amounts, recipients, USDC mint
 * 4. Record unlock in DB
 * 5. Return signed R2 URL (5-min expiry)
 */
export async function POST(req: NextRequest) {
  const { postId, txSignature } = await req.json();

  if (!postId || !txSignature) {
    return NextResponse.json(
      { error: 'Required: postId, txSignature' },
      { status: 400 }
    );
  }

  // Get post
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'published') {
    return NextResponse.json({ error: 'Post not published' }, { status: 400 });
  }

  if (!post.originalKey) {
    return NextResponse.json({ error: 'Post has no image' }, { status: 400 });
  }

  // Get creator wallet
  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.id, post.creatorId!))
    .limit(1);

  if (!creator?.solanaWalletAddress) {
    return NextResponse.json({ error: 'Creator wallet not configured' }, { status: 500 });
  }

  // Verify on-chain transaction
  const verification = await verifyUnlockTransaction(
    txSignature,
    creator.solanaWalletAddress,
    post.priceLamports || 1_000_000
  );

  if (!verification.valid) {
    return NextResponse.json(
      { error: `Transaction verification failed: ${verification.error}` },
      { status: 400 }
    );
  }

  // Check for duplicate unlock
  const [existingUnlock] = await db
    .select()
    .from(schema.unlocks)
    .where(eq(schema.unlocks.solanaTxSignature, txSignature))
    .limit(1);

  if (existingUnlock) {
    // Already unlocked — return the image URL
    const imageUrl = await getUnlockedImageUrl(post.originalKey);
    return NextResponse.json({ success: true, imageUrl, unlockId: existingUnlock.id });
  }

  // Record unlock
  const unlockId = randomUUID();
  await db.insert(schema.unlocks).values({
    id: unlockId,
    postId,
    solanaTxSignature: txSignature,
    amountLamports: verification.amountLamports,
    platformFeeLamports: verification.platformFeeLamports,
    creatorPayoutLamports: verification.creatorPayoutLamports,
    buyerWalletAddress: verification.buyerWallet,
    unlockType: 'payment',
  });

  // Update post stats
  await db
    .update(schema.posts)
    .set({
      unlockCount: sql`${schema.posts.unlockCount} + 1`,
      revenueLamports: sql`${schema.posts.revenueLamports} + ${verification.creatorPayoutLamports}`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.posts.id, postId));

  // Update creator stats
  await db
    .update(schema.creators)
    .set({
      totalUnlocks: sql`${schema.creators.totalUnlocks} + 1`,
      totalRevenueLamports: sql`${schema.creators.totalRevenueLamports} + ${verification.creatorPayoutLamports}`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.creators.id, creator.id));

  // Return signed image URL
  const imageUrl = await getUnlockedImageUrl(post.originalKey);

  return NextResponse.json({
    success: true,
    unlockId,
    imageUrl,
    payment: {
      amount: verification.amountLamports,
      platformFee: verification.platformFeeLamports,
      creatorPayout: verification.creatorPayoutLamports,
    },
  });
}
