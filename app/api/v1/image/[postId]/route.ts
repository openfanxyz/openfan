import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, and } from 'drizzle-orm';
import { authenticate, verifyWalletAuth } from '@/lib/auth';
import { getUnlockedImageUrl } from '@/lib/image';

/**
 * GET /api/v1/image/:postId
 * Serve unlocked image. Verifies the caller has a valid unlock record.
 *
 * Auth: OpenClaw JWT, API key, or wallet address
 * Query: ?wallet=<address> (for wallet-based auth)
 *
 * Returns: redirect to signed R2 URL (5-min expiry)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;

  // Get post
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (!post.originalKey) {
    return NextResponse.json({ error: 'No image available' }, { status: 404 });
  }

  // Check auth — agent JWT/API key
  const auth = await authenticate(req);
  if (auth) {
    // Check if agent has an unlock record
    const [unlock] = await db
      .select()
      .from(schema.unlocks)
      .where(
        and(
          eq(schema.unlocks.postId, postId),
          eq(schema.unlocks.agentId, auth.agentId || 'api-key-user')
        )
      )
      .limit(1);

    if (unlock) {
      const imageUrl = await getUnlockedImageUrl(post.originalKey);
      return NextResponse.redirect(imageUrl);
    }
  }

  // Check wallet-based auth
  const walletAddress = verifyWalletAuth(req) ||
    req.nextUrl.searchParams.get('wallet');

  if (walletAddress) {
    const [unlock] = await db
      .select()
      .from(schema.unlocks)
      .where(
        and(
          eq(schema.unlocks.postId, postId),
          eq(schema.unlocks.buyerWalletAddress, walletAddress)
        )
      )
      .limit(1);

    if (unlock) {
      const imageUrl = await getUnlockedImageUrl(post.originalKey);
      return NextResponse.redirect(imageUrl);
    }
  }

  return NextResponse.json({ error: 'Not unlocked' }, { status: 403 });
}
