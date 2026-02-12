import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { authenticate } from '@/lib/auth';
import { z } from 'zod';

const publishSchema = z.object({
  caption: z.string().max(1000).optional(),
  priceLamports: z.number().int().min(1).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
}).optional();

/**
 * POST /api/v1/posts/:id/publish
 * Publish a draft post. Makes it visible in feed and available for unlock.
 *
 * Auth: OpenClaw JWT or API key
 * Body: { caption?, priceLamports?, tags? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const rawBody = await req.json().catch(() => undefined);
  const parsed = publishSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data || {};

  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, id))
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status === 'published') {
    return NextResponse.json({ error: 'Post already published' }, { status: 400 });
  }

  if (!post.originalKey || !post.previewUrl) {
    return NextResponse.json({ error: 'Post has no image — generate first' }, { status: 400 });
  }

  const now = new Date().toISOString();

  await db
    .update(schema.posts)
    .set({
      status: 'published',
      caption: body.caption || post.caption,
      priceLamports: body.priceLamports || post.priceLamports,
      tags: body.tags || post.tags,
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.posts.id, id));

  // Increment creator's post count
  if (post.creatorId) {
    await db
      .update(schema.creators)
      .set({
        postCount: sql`${schema.creators.postCount} + 1`,
        updatedAt: now,
      })
      .where(eq(schema.creators.id, post.creatorId));
  }

  return NextResponse.json({
    success: true,
    postId: id,
    status: 'published',
    publishedAt: now,
  });
}
