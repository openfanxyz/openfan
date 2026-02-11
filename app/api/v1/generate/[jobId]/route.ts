import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { authenticate } from '@/lib/auth';
import { pollGeneration } from '@/lib/runpod';
import { ingestImage } from '@/lib/image';

/**
 * GET /api/v1/generate/:jobId
 * Poll generation job status. If complete, ingests images and creates draft posts.
 *
 * Auth: OpenClaw JWT or API key
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  const [job] = await db
    .select()
    .from(schema.generationJobs)
    .where(eq(schema.generationJobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // If already completed/failed, return current state
  if (job.status === 'completed' || job.status === 'failed') {
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      outputData: job.outputData,
      errorMessage: job.errorMessage,
      completedAt: job.completedAt,
    });
  }

  // Poll RunPod for status
  if (!job.runpodRequestId) {
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      message: 'Waiting for RunPod submission',
    });
  }

  // Get endpoint URL from creator or agent connection
  const [creator] = await db
    .select()
    .from(schema.creators)
    .where(eq(schema.creators.id, job.creatorId!))
    .limit(1);

  let endpointUrl: string;
  let apiKey: string;

  if (job.generationPath === 'self_hosted' && creator?.runpodEndpointUrl) {
    endpointUrl = creator.runpodEndpointUrl;
    const [connection] = await db
      .select()
      .from(schema.agentConnections)
      .where(eq(schema.agentConnections.creatorId, creator.id))
      .limit(1);
    apiKey = connection?.runpodApiKey || '';
  } else {
    endpointUrl = process.env.RUNPOD_PLATFORM_ENDPOINT || '';
    apiKey = process.env.RUNPOD_PLATFORM_API_KEY || '';
  }

  try {
    const runpodStatus = await pollGeneration(endpointUrl, apiKey, job.runpodRequestId);

    if (runpodStatus.status === 'COMPLETED' && runpodStatus.output?.images) {
      // Ingest images and create draft posts
      const postIds: string[] = [];

      for (const imageBase64 of runpodStatus.output.images) {
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        const postId = randomUUID();

        const ingested = await ingestImage(
          imageBuffer,
          creator?.slug || 'unknown',
          postId
        );

        await db.insert(schema.posts).values({
          id: postId,
          creatorId: job.creatorId,
          status: 'draft',
          generationJobId: job.id,
          prompt: job.prompt,
          originalKey: ingested.originalKey,
          previewUrl: ingested.previewUrl,
          width: ingested.width,
          height: ingested.height,
        });

        postIds.push(postId);
      }

      // Update job as completed
      await db
        .update(schema.generationJobs)
        .set({
          status: 'completed',
          outputData: { postIds },
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.generationJobs.id, jobId));

      return NextResponse.json({
        jobId: job.id,
        status: 'completed',
        postIds,
        message: `${postIds.length} draft post(s) created. Use POST /api/v1/posts/:id/publish to publish.`,
      });
    }

    if (runpodStatus.status === 'FAILED') {
      const errorMsg = runpodStatus.error || runpodStatus.output?.error || 'Generation failed';
      await db
        .update(schema.generationJobs)
        .set({
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.generationJobs.id, jobId));

      return NextResponse.json({
        jobId: job.id,
        status: 'failed',
        error: errorMsg,
      });
    }

    // Still in progress
    return NextResponse.json({
      jobId: job.id,
      status: runpodStatus.status === 'IN_QUEUE' ? 'pending' : 'running',
      runpodStatus: runpodStatus.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        error: error instanceof Error ? error.message : 'Poll failed',
      },
      { status: 500 }
    );
  }
}
