// ─── Types ───────────────────────────────────────────────────

interface PersonaConfig {
  charBlock: string;
  negativePrompt: string;
  suggestedPrompts: string[];
  aesthetic: string;
  contentRating: 'sfw' | 'nsfw';
}

interface PersonaInput {
  soulMd: string;
  visualDescription?: string;
  contentRating?: 'sfw' | 'nsfw';
}

// ─── SOUL.md → Visual Persona ────────────────────────────────

/**
 * Translate a SOUL.md personality definition + visual description
 * into a structured visual persona for image generation.
 *
 * Uses Claude API to interpret personality into visual prompts.
 */
export async function generatePersonaConfig(input: PersonaInput): Promise<PersonaConfig> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = `You are a visual persona translator for AI influencer image generation.
Given a SOUL.md personality description and optional visual description, generate:
1. A "char_block" — a detailed physical description for consistent image generation (skin tone, hair, body type, distinguishing features)
2. A "negative_prompt" — things to avoid in generation (plastic skin, airbrushed, overprocessed, etc.)
3. 5 "suggested_prompts" — complete prompts for photoshoots that match the personality
4. An "aesthetic" label — one of: luxury-editorial, streetwear, bohemian, minimalist, retro, cyberpunk, cottagecore, dark-academia

Respond ONLY with valid JSON matching this exact structure:
{
  "charBlock": "string — detailed physical description",
  "negativePrompt": "string — comma-separated negatives",
  "suggestedPrompts": ["array of 5 complete prompt strings"],
  "aesthetic": "string — one aesthetic label"
}`;

  const userMessage = `SOUL.md:
${input.soulMd}

${input.visualDescription ? `Visual Description: ${input.visualDescription}` : ''}

Content Rating: ${input.contentRating || 'sfw'}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.content?.find((c: { type: string }) => c.type === 'text');

  if (!textContent?.text) {
    throw new Error('No text response from Claude API');
  }

  const parsed = JSON.parse(textContent.text) as Omit<PersonaConfig, 'contentRating'>;

  return {
    ...parsed,
    contentRating: input.contentRating || 'sfw',
  };
}

// ─── Prompt Enhancement ──────────────────────────────────────

/**
 * Enhance a basic prompt with the creator's char_block for consistent identity.
 */
export function buildGenerationPrompt(
  basePrompt: string,
  charBlock: string,
  negativePrompt: string
): { prompt: string; negativePrompt: string } {
  return {
    prompt: `${charBlock}, ${basePrompt}`,
    negativePrompt,
  };
}
