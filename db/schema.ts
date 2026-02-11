import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Operators ───────────────────────────────────────────────
// People/orgs who run AI creators on OpenFan
export const operators = sqliteTable('operators', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  solanaWalletAddress: text('solana_wallet_address'),
  platformFeePercent: integer('platform_fee_percent').default(10),
  openclawOrgId: text('openclaw_org_id'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// ─── Creators ────────────────────────────────────────────────
// AI influencer profiles on the marketplace
export const creators = sqliteTable('creators', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').references(() => operators.id),
  slug: text('slug').unique().notNull(),
  name: text('name').notNull(),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  coverUrl: text('cover_url'),
  solanaWalletAddress: text('solana_wallet_address'),
  personaConfig: text('persona_config', { mode: 'json' }).$type<{
    charBlock: string;
    negativePrompt: string;
    suggestedPrompts: string[];
    aesthetic: string;
    contentRating: 'sfw' | 'nsfw';
  }>(),
  runpodEndpointUrl: text('runpod_endpoint_url'),
  pipelineStatus: text('pipeline_status').$type<'draft' | 'ready' | 'disabled'>().default('draft'),
  postCount: integer('post_count').default(0),
  totalUnlocks: integer('total_unlocks').default(0),
  totalRevenueLamports: integer('total_revenue_lamports').default(0),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// ─── Agent Connections ───────────────────────────────────────
// OpenClaw agents connected to OpenFan
export const agentConnections = sqliteTable('agent_connections', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').references(() => operators.id),
  openclawAgentId: text('openclaw_agent_id').notNull(),
  soulMd: text('soul_md'),
  visualDescription: text('visual_description'),
  solanaWalletAddress: text('solana_wallet_address').notNull(),
  runpodEndpointUrl: text('runpod_endpoint_url'),
  runpodApiKey: text('runpod_api_key'),
  creatorId: text('creator_id').references(() => creators.id),
  connectionStatus: text('connection_status').$type<'pending' | 'active' | 'disconnected'>().default('pending'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ─── Posts ───────────────────────────────────────────────────
// Content published by creators (images)
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id').references(() => creators.id),
  status: text('status').$type<'draft' | 'published' | 'archived'>().default('draft'),
  caption: text('caption'),
  previewUrl: text('preview_url'),
  originalKey: text('original_key'),
  generationJobId: text('generation_job_id'),
  generationType: text('generation_type').default('zimage'),
  prompt: text('prompt'),
  seed: integer('seed'),
  width: integer('width').default(1024),
  height: integer('height').default(1024),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  priceLamports: integer('price_lamports').default(1_000_000), // 1 USDC = 1,000,000 lamports
  unlockCount: integer('unlock_count').default(0),
  revenueLamports: integer('revenue_lamports').default(0),
  publishedAt: text('published_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

// ─── Unlocks ─────────────────────────────────────────────────
// Records of content unlocked by fans/bots via Solana USDC
export const unlocks = sqliteTable('unlocks', {
  id: text('id').primaryKey(),
  postId: text('post_id').references(() => posts.id),
  solanaTxSignature: text('solana_tx_signature'),
  amountLamports: integer('amount_lamports'),
  platformFeeLamports: integer('platform_fee_lamports'),
  creatorPayoutLamports: integer('creator_payout_lamports'),
  buyerWalletAddress: text('buyer_wallet_address'),
  agentId: text('agent_id'),
  unlockType: text('unlock_type').$type<'payment' | 'agent' | 'promo'>().default('payment'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ─── Generation Jobs ─────────────────────────────────────────
// Track image generation jobs (self-hosted or platform RunPod)
export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  creatorId: text('creator_id').references(() => creators.id),
  agentId: text('agent_id'),
  generationPath: text('generation_path').$type<'self_hosted' | 'platform'>().notNull(),
  runpodRequestId: text('runpod_request_id'),
  status: text('status').$type<'pending' | 'running' | 'completed' | 'failed'>().default('pending'),
  prompt: text('prompt').notNull(),
  model: text('model').default('zimage-turbo'),
  inputParams: text('input_params', { mode: 'json' }).$type<Record<string, unknown>>(),
  outputData: text('output_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  costLamports: integer('cost_lamports'),
  paymentTxSignature: text('payment_tx_signature'),
  errorMessage: text('error_message'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

// ─── API Keys ────────────────────────────────────────────────
// For operators not using OpenClaw JWT auth
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').references(() => operators.id),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  name: text('name'),
  scopes: text('scopes', { mode: 'json' }).$type<string[]>(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
