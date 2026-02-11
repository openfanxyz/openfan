import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Config ──────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_ORIGINALS = process.env.R2_BUCKET_ORIGINALS || 'openfan-originals';
const R2_BUCKET_PREVIEWS = process.env.R2_BUCKET_PREVIEWS || 'openfan-previews';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

// ─── Client ──────────────────────────────────────────────────

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

// ─── Upload ──────────────────────────────────────────────────

/**
 * Upload the original (full-resolution) image to R2 private bucket.
 * Returns the object key.
 */
export async function uploadOriginal(
  key: string,
  buffer: Buffer,
  contentType = 'image/jpeg'
): Promise<string> {
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_ORIGINALS,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return key;
}

/**
 * Upload a blurred preview to R2 public bucket.
 * Returns the public URL.
 */
export async function uploadPreview(
  key: string,
  buffer: Buffer,
  contentType = 'image/jpeg'
): Promise<string> {
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_PREVIEWS,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  // Previews are public
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }

  return `https://${R2_BUCKET_PREVIEWS}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;
}

// ─── Signed URLs ─────────────────────────────────────────────

/**
 * Generate a presigned URL for accessing an original (private) image.
 * Default expiry: 5 minutes.
 */
export async function getSignedOriginalUrl(
  key: string,
  expiresInSeconds = 300
): Promise<string> {
  const client = getClient();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_ORIGINALS,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
