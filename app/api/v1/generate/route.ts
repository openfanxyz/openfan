import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { authenticate } from '@/lib/auth';
import { checkRateLimit } from '@/lib/ratelimit';
import { z } from 'zod';

export const maxDuration = 60;
import {
  submitGeneration,
  getPlatformEndpoint,
  PLATFORM_GENERATION_COST_LAMPORTS,
} from '@/lib/runpod';
import { verifyGenerationPayment } from '@/lib/solana';
import { buildGenerationPrompt } from '@/lib/persona';

const generateSchema = z.object({
  creatorSlug: z.string().min(1).max(100),
  prompt: z.string().min(1).max(2000),
  numImages: z.number().int().min(1).max(4).optional().default(1),
  width: z.number().int().min(256).max(2048).optional().default(1024),
  height: z.number().int().min(256).max(2048).optional().default(1024),
  seed: z.number().int().optional(),
  paymentTxSignature: z.string().min(64).max(128).optional(),
});

/**
 * POST /api/v1/generate
 * Trigger image generation for a creator.
 *
 * Auth: OpenClaw JWT or API key
 * Body: {
 *   creatorSlug: string,
 *   prompt: string,
 *   numImages?: number (default 1, max 4),
 *   width?: number,
 *   height?: number,
 *   seed?: number,
 *   paymentTxSignature?: string (required for Path B / platform generation)
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = checkRateLimit(req, 'generate', { maxRequests: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { creatorSlug, prompt, numImages, width, height, seed, paymentTxSignature } = parsed.data;

  // Find creator
  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.slug, creatorSlug))
    .limit(1);

  if (!creator) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  // Determine generation path
  const isSelfHosted = !!creator.runpodEndpointUrl;
  let endpointUrl: string;
  let apiKey: string;

  if (isSelfHosted) {
    // Path A: Self-hosted — use creator's RunPod
    endpointUrl = creator.runpodEndpointUrl!;

    // Get API key from agent connection
    const [connection] = await db
      .select()
      .from(schema.agentConnections)
      .where(eq(schema.agentConnections.creatorId, creator.id))
      .limit(1);

    apiKey = connection?.runpodApiKey || '';
    if (!apiKey) {
      return NextResponse.json(
        { error: 'RunPod API key not configured for self-hosted generation' },
        { status: 400 }
      );
    }
  } else {
    // Path B: Platform generation — verify payment
    if (!paymentTxSignature) {
      const totalCost = PLATFORM_GENERATION_COST_LAMPORTS * numImages;
      return NextResponse.json(
        {
          error: 'Platform generation requires USDC payment',
          costPerImage: PLATFORM_GENERATION_COST_LAMPORTS,
          totalCost,
          message: `Send ${totalCost} USDC lamports to platform wallet, then include paymentTxSignature`,
        },
        { status: 402 }
      );
    }

    // Verify payment
    const expectedAmount = PLATFORM_GENERATION_COST_LAMPORTS * numImages;
    const paymentVerification = await verifyGenerationPayment(
      paymentTxSignature,
      expectedAmount
    );

    if (!paymentVerification.valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${paymentVerification.error}` },
        { status: 400 }
      );
    }

    const platform = getPlatformEndpoint();
    endpointUrl = platform.url;
    apiKey = platform.apiKey;
  }

  // Build enhanced prompt with char_block
  const personaConfig = creator.personaConfig;
  let finalPrompt = prompt;
  let negativePrompt: string | undefined;

  if (personaConfig) {
    const enhanced = buildGenerationPrompt(
      prompt,
      personaConfig.charBlock,
      personaConfig.negativePrompt
    );
    finalPrompt = enhanced.prompt;
    negativePrompt = enhanced.negativePrompt;
  }

  // Create generation job
  const jobId = randomUUID();
  await db.insert(schema.generationJobs).values({
    id: jobId,
    creatorId: creator.id,
    agentId: auth.agentId || null,
    generationPath: isSelfHosted ? 'self_hosted' : 'platform',
    status: 'pending',
    prompt: finalPrompt,
    inputParams: { width, height, seed, numImages, negativePrompt },
    costLamports: isSelfHosted ? null : PLATFORM_GENERATION_COST_LAMPORTS * numImages,
    paymentTxSignature: paymentTxSignature || null,
  });

  // Submit to RunPod
  try {
    const result = await submitGeneration(endpointUrl, apiKey, {
      prompt: finalPrompt,
      negativePrompt,
      charBlock: personaConfig?.charBlock,
      width,
      height,
      seed,
      numImages,
    });

    // Update job with RunPod request ID
    await db
      .update(schema.generationJobs)
      .set({
        runpodRequestId: result.requestId,
        status: 'running',
        startedAt: new Date().toISOString(),
      })
      .where(eq(schema.generationJobs.id, jobId));

    return NextResponse.json({
      jobId,
      runpodRequestId: result.requestId,
      status: 'running',
      generationPath: isSelfHosted ? 'self_hosted' : 'platform',
      pollUrl: `/api/v1/generate/${jobId}`,
    }, { status: 202 });
  } catch (error) {
    // Update job as failed
    await db
      .update(schema.generationJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Submission failed',
      })
      .where(eq(schema.generationJobs.id, jobId));

    return NextResponse.json(
      { error: 'Generation submission failed', jobId },
      { status: 500 }
    );
  }
}
