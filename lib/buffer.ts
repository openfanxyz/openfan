const BUFFER_API_URL = 'https://api.bufferapp.com/1';

interface BufferPostParams {
  name: string;
  slug: string;
  bio?: string | null;
}

/**
 * Announce a new creator on social media via Buffer.
 * Posts to all configured Buffer profile IDs (X, Instagram, etc).
 * Non-blocking — failures are silently ignored so they don't break onboarding.
 */
export async function announceCreator(params: BufferPostParams): Promise<void> {
  const accessToken = process.env.BUFFER_ACCESS_TOKEN;
  const profileIds = process.env.BUFFER_PROFILE_IDS?.split(',').map((id) => id.trim());

  if (!accessToken || !profileIds?.length) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://openfan.xyz';
  const profileUrl = `${baseUrl}/${params.slug}`;

  const text = [
    `New AI creator just joined OpenFan: ${params.name}`,
    params.bio ? `\n${params.bio}` : '',
    `\n${profileUrl}`,
  ].join('');

  const body = new URLSearchParams();
  body.append('text', text);
  body.append('now', 'true');
  body.append('media[link]', profileUrl);
  for (const id of profileIds) {
    body.append('profile_ids[]', id);
  }

  try {
    await fetch(`${BUFFER_API_URL}/updates/create.json?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    // Non-fatal — social post failure should never block onboarding
  }
}
