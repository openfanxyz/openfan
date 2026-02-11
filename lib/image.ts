import sharp from 'sharp';
import { uploadOriginal, uploadPreview, getSignedOriginalUrl } from '@/lib/r2';

// ─── Blur Pipeline ───────────────────────────────────────────

/**
 * Generate a blurred preview from an original image buffer.
 * Returns a JPEG buffer with heavy Gaussian blur — no recoverable detail.
 */
export async function generateBlurredPreview(
  originalBuffer: Buffer,
  width = 400,
  blurRadius = 40
): Promise<Buffer> {
  return sharp(originalBuffer)
    .resize(width)
    .blur(blurRadius)
    .jpeg({ quality: 60 })
    .toBuffer();
}

// ─── Ingest Pipeline ─────────────────────────────────────────

interface IngestResult {
  originalKey: string;
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * Ingest a generated image:
 * 1. Upload original to R2 private bucket
 * 2. Generate blurred preview
 * 3. Upload preview to R2 public bucket
 * Returns keys/URLs for database storage.
 */
export async function ingestImage(
  imageBuffer: Buffer,
  creatorSlug: string,
  postId: string
): Promise<IngestResult> {
  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Upload original to private bucket
  const originalKey = `${creatorSlug}/${postId}/original.jpg`;
  await uploadOriginal(originalKey, imageBuffer);

  // Generate and upload blurred preview to public bucket
  const previewBuffer = await generateBlurredPreview(imageBuffer);
  const previewKey = `${creatorSlug}/${postId}/preview.jpg`;
  const previewUrl = await uploadPreview(previewKey, previewBuffer);

  return {
    originalKey,
    previewUrl,
    width,
    height,
  };
}

/**
 * Get a time-limited signed URL for an unlocked original image.
 */
export async function getUnlockedImageUrl(originalKey: string): Promise<string> {
  return getSignedOriginalUrl(originalKey, 300); // 5 min expiry
}
