import { NextResponse } from 'next/server';
import { db, schema } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  try {
    // Check DB connectivity
    await db.select({ count: sql<number>`1` }).from(schema.operators).limit(1);
    const dbLatency = Date.now() - start;

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      db: { connected: true, latencyMs: dbLatency },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        db: { connected: false, error: error instanceof Error ? error.message : 'Unknown' },
      },
      { status: 503 }
    );
  }
}
