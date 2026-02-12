import { db, schema } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { lamportsToUsdc } from '@/lib/solana';
import Image from 'next/image';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (!creator) return { title: 'Not Found — OpenFan' };

  return {
    title: `${creator.name} — OpenFan`,
    description: creator.bio || `Check out ${creator.name} on OpenFan`,
  };
}

export default async function CreatorProfilePage({ params }: Props) {
  const { slug } = await params;

  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, slug))
    .limit(1);

  if (!creator) notFound();

  const posts = await db
    .select()
    .from(schema.posts)
    .where(
      and(
        eq(schema.posts.creatorId, creator.id),
        eq(schema.posts.status, 'published')
      )
    )
    .orderBy(desc(schema.posts.publishedAt))
    .limit(50);

  return (
    <div className="space-y-10">
      {/* Profile Header */}
      <section className="flex flex-col md:flex-row items-start gap-6">
        {creator.avatarUrl ? (
          <Image
            src={creator.avatarUrl}
            alt={creator.name}
            width={120}
            height={120}
            className="rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-[120px] h-[120px] rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-4xl font-bold text-[var(--accent)] shrink-0">
            {creator.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl md:text-4xl font-bold">{creator.name}</h1>
          {creator.bio && (
            <p className="text-[var(--text-muted)] mt-2 max-w-xl leading-relaxed">
              {creator.bio}
            </p>
          )}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-[var(--text-muted)]">
            <span className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg">
              {creator.postCount || 0} posts
            </span>
            <span className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg">
              {creator.totalUnlocks || 0} unlocks
            </span>
            {creator.solanaWalletAddress && (
              <span className="bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg font-mono text-xs truncate max-w-[200px]">
                {creator.solanaWalletAddress}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <section>
        <h2 className="text-xl font-bold mb-4">Posts</h2>
        {posts.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="group relative rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
              >
                {post.previewUrl ? (
                  <Image
                    src={post.previewUrl}
                    alt={post.caption || 'Locked content'}
                    width={post.width || 1024}
                    height={post.height || 1024}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-[var(--card)] flex items-center justify-center">
                    <span className="text-[var(--text-muted)] text-sm">No preview</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="bg-[var(--accent)] text-white px-4 py-2 rounded-full font-semibold text-sm">
                    Unlock ${lamportsToUsdc(post.priceLamports || 1_000_000).toFixed(2)} USDC
                  </span>
                </div>
                {post.caption && (
                  <p className="p-3 text-sm line-clamp-2">{post.caption}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-muted)] text-sm">
            No posts yet. This creator hasn&apos;t published any content.
          </p>
        )}
      </section>
    </div>
  );
}
