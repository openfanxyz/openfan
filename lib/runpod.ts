// ─── Types ───────────────────────────────────────────────────

interface RunPodInput {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  num_images?: number;
  char_block?: string;
}

interface RunPodRunResponse {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

interface RunPodStatusResponse {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  output?: {
    images?: string[]; // base64 encoded images
    error?: string;
  };
  error?: string;
}

interface GenerateParams {
  prompt: string;
  negativePrompt?: string;
  charBlock?: string;
  width?: number;
  height?: number;
  seed?: number;
  numImages?: number;
}

interface GenerateResult {
  requestId: string;
  status: string;
}

// ─── RunPod Client ───────────────────────────────────────────

/**
 * Submit a generation job to a RunPod serverless endpoint.
 * Works with both self-hosted (user's endpoint) and platform endpoints.
 */
export async function submitGeneration(
  endpointUrl: string,
  apiKey: string,
  params: GenerateParams
): Promise<GenerateResult> {
  const input: RunPodInput = {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    width: params.width || 1024,
    height: params.height || 1024,
    seed: params.seed,
    num_images: params.numImages || 1,
    char_block: params.charBlock,
  };

  // RunPod serverless /run endpoint (async)
  const runUrl = `${endpointUrl.replace(/\/$/, '')}/run`;

  const response = await fetch(runUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunPod submission failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as RunPodRunResponse;

  return {
    requestId: data.id,
    status: data.status,
  };
}

/**
 * Poll a RunPod job for status and results.
 */
export async function pollGeneration(
  endpointUrl: string,
  apiKey: string,
  requestId: string
): Promise<RunPodStatusResponse> {
  const statusUrl = `${endpointUrl.replace(/\/$/, '')}/status/${requestId}`;

  const response = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunPod status check failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as RunPodStatusResponse;
}

/**
 * Submit a synchronous generation (waits for result).
 * Uses RunPod /runsync endpoint. Good for single images.
 */
export async function generateSync(
  endpointUrl: string,
  apiKey: string,
  params: GenerateParams
): Promise<{ images: string[]; error?: string }> {
  const input: RunPodInput = {
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    width: params.width || 1024,
    height: params.height || 1024,
    seed: params.seed,
    num_images: params.numImages || 1,
    char_block: params.charBlock,
  };

  const runsyncUrl = `${endpointUrl.replace(/\/$/, '')}/runsync`;

  const response = await fetch(runsyncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunPod sync generation failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as RunPodStatusResponse;

  if (data.status === 'FAILED' || data.error) {
    return { images: [], error: data.error || data.output?.error || 'Generation failed' };
  }

  return {
    images: data.output?.images || [],
  };
}

// ─── Platform Endpoint ───────────────────────────────────────

/**
 * Get the platform's own RunPod endpoint config.
 * Used for Path B (pay-per-image) generation.
 */
export function getPlatformEndpoint(): { url: string; apiKey: string } {
  const url = process.env.RUNPOD_PLATFORM_ENDPOINT;
  const apiKey = process.env.RUNPOD_PLATFORM_API_KEY;

  if (!url || !apiKey) {
    throw new Error('Platform RunPod endpoint not configured');
  }

  return { url, apiKey };
}

/**
 * Cost per image for platform generation (in USDC lamports).
 * $0.05 per image = 50,000 USDC lamports
 */
export const PLATFORM_GENERATION_COST_LAMPORTS = 50_000;
