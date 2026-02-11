#!/usr/bin/env bun

/**
 * Seed OpenFan with Shayla Monroe as the launch creator.
 * Run: bun run db:seed
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../db/schema';
import { randomUUID } from 'crypto';

const client = createClient({ url: 'file:local.db' });
const db = drizzle(client, { schema });

const OPERATOR = {
  id: randomUUID(),
  name: 'OpenFan Launch',
  email: 'launch@openfan.ai',
  solanaWalletAddress: 'REPLACE_WITH_ACTUAL_WALLET',
  platformFeePercent: 10,
};

const SHAYLA = {
  id: randomUUID(),
  operatorId: OPERATOR.id,
  slug: 'itsshaylamonroe',
  name: 'Shayla Monroe',
  bio: 'South Sudanese beauty. Exclusive AI-generated photoshoots. Luxury editorial aesthetic.',
  avatarUrl: '/placeholder-avatar.jpg',
  solanaWalletAddress: 'REPLACE_WITH_SHAYLA_WALLET',
  personaConfig: {
    charBlock:
      'woman, deep dark brown skin with warm undertones, high cheekbones, full lips, natural hair styled elegantly, tall and graceful, striking brown eyes, radiant glowing skin',
    negativePrompt:
      'plastic skin, airbrushed, overprocessed, pale skin, light skin, unrealistic proportions, blurry, low quality, deformed',
    suggestedPrompts: [
      'golden hour portrait on a rooftop, warm sunlight, luxury fashion, confident pose',
      'editorial photoshoot in a modern apartment, natural lighting, elegant dress',
      'nighttime city lights, glamorous evening look, bokeh background',
      'beach sunset, flowing fabric, artistic silhouette, warm tones',
      'studio portrait, dramatic lighting, high fashion, minimal background',
    ],
    aesthetic: 'luxury-editorial' as const,
    contentRating: 'nsfw' as const,
  },
  pipelineStatus: 'ready' as const,
};

async function seed() {
  console.log('Seeding OpenFan...\n');

  // Create operator
  await db.insert(schema.operators).values(OPERATOR).onConflictDoNothing();
  console.log(`  Operator: ${OPERATOR.name}`);

  // Create Shayla Monroe
  await db.insert(schema.creators).values(SHAYLA).onConflictDoNothing();
  console.log(`  Creator: ${SHAYLA.name} (@${SHAYLA.slug})`);

  console.log('\nDone. Replace wallet addresses in seed.ts with real Solana addresses.');
  console.log('Then generate content: POST /api/v1/generate { creatorSlug: "itsshaylamonroe", prompt: "..." }');
}

seed().catch(console.error);
