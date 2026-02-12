import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  Keypair,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { env } from '@/lib/env';

// ─── Constants ───────────────────────────────────────────────

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey(
  env.USDC_MINT_ADDRESS || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

// OpenFan platform wallet (receives protocol fees)
const PLATFORM_WALLET = new PublicKey(
  env.OPENFAN_PLATFORM_WALLET
);

// Protocol fee percentage (10%)
const PROTOCOL_FEE_BPS = 1000; // 10% in basis points

// USDC has 6 decimals → 1 USDC = 1,000,000 lamports
const USDC_DECIMALS = 6;

// ─── Connection ──────────────────────────────────────────────

let connectionInstance: Connection | null = null;

function getConnection(): Connection {
  if (!connectionInstance) {
    const rpcUrl = env.SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
    connectionInstance = new Connection(rpcUrl, 'finalized');
  }
  return connectionInstance;
}

// ─── Types ───────────────────────────────────────────────────

interface UnlockTransactionParams {
  buyerWallet: PublicKey;
  creatorWallet: PublicKey;
  amountLamports: number; // total USDC in smallest unit
}

interface TransactionVerification {
  valid: boolean;
  amountLamports: number;
  platformFeeLamports: number;
  creatorPayoutLamports: number;
  buyerWallet: string;
  creatorWallet: string;
  error?: string;
}

// ─── Build Unlock Transaction ────────────────────────────────

/**
 * Build a Solana transaction for unlocking content.
 * Splits payment: 90% to creator, 10% to platform.
 * Returns unsigned transaction for the buyer to sign.
 */
export async function buildUnlockTransaction(
  params: UnlockTransactionParams
): Promise<{ transaction: string; platformFee: number; creatorPayout: number }> {
  const connection = getConnection();

  const platformFee = Math.floor((params.amountLamports * PROTOCOL_FEE_BPS) / 10000);
  const creatorPayout = params.amountLamports - platformFee;

  // Get associated token accounts
  const buyerAta = await getAssociatedTokenAddress(USDC_MINT, params.buyerWallet);
  const creatorAta = await getAssociatedTokenAddress(USDC_MINT, params.creatorWallet);
  const platformAta = await getAssociatedTokenAddress(USDC_MINT, PLATFORM_WALLET);

  const transaction = new Transaction();

  // Transfer 90% to creator
  transaction.add(
    createTransferInstruction(
      buyerAta,
      creatorAta,
      params.buyerWallet,
      BigInt(creatorPayout),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Transfer 10% to platform
  transaction.add(
    createTransferInstruction(
      buyerAta,
      platformAta,
      params.buyerWallet,
      BigInt(platformFee),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = params.buyerWallet;

  // Serialize as base64 for client signing
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    transaction: Buffer.from(serialized).toString('base64'),
    platformFee,
    creatorPayout,
  };
}

// ─── Verify On-Chain Transaction ─────────────────────────────

/**
 * Verify a Solana transaction on-chain.
 * Confirms: finalized, correct amounts, correct recipients, USDC mint.
 */
export async function verifyUnlockTransaction(
  txSignature: string,
  expectedCreatorWallet: string,
  expectedAmountLamports: number
): Promise<TransactionVerification> {
  const connection = getConnection();

  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, amountLamports: 0, platformFeeLamports: 0, creatorPayoutLamports: 0, buyerWallet: '', creatorWallet: '', error: 'Transaction not found' };
    }

    if (tx.meta?.err) {
      return { valid: false, amountLamports: 0, platformFeeLamports: 0, creatorPayoutLamports: 0, buyerWallet: '', creatorWallet: '', error: 'Transaction failed on-chain' };
    }

    // Parse pre/post token balances to verify USDC transfers
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Verify the expected creator received ~90% and platform received ~10%
    const expectedPlatformFee = Math.floor((expectedAmountLamports * PROTOCOL_FEE_BPS) / 10000);
    const expectedCreatorPayout = expectedAmountLamports - expectedPlatformFee;

    // Find creator balance change
    const creatorPost = postBalances.find(
      (b) => b.owner === expectedCreatorWallet && b.mint === USDC_MINT.toBase58()
    );
    const creatorPre = preBalances.find(
      (b) => b.owner === expectedCreatorWallet && b.mint === USDC_MINT.toBase58()
    );

    if (!creatorPost) {
      return { valid: false, amountLamports: 0, platformFeeLamports: 0, creatorPayoutLamports: 0, buyerWallet: '', creatorWallet: '', error: 'Creator wallet not found in transaction' };
    }

    const creatorReceived =
      Number(creatorPost.uiTokenAmount.amount) -
      Number(creatorPre?.uiTokenAmount.amount || 0);

    // Allow 1 lamport tolerance for rounding
    if (Math.abs(creatorReceived - expectedCreatorPayout) > 1) {
      return { valid: false, amountLamports: 0, platformFeeLamports: 0, creatorPayoutLamports: 0, buyerWallet: '', creatorWallet: '', error: `Creator payout mismatch: expected ${expectedCreatorPayout}, got ${creatorReceived}` };
    }

    // Verify platform received the expected fee
    const platformAddress = PLATFORM_WALLET.toBase58();
    const platformPost = postBalances.find(
      (b) => b.owner === platformAddress && b.mint === USDC_MINT.toBase58()
    );
    const platformPre = preBalances.find(
      (b) => b.owner === platformAddress && b.mint === USDC_MINT.toBase58()
    );

    const platformReceived =
      Number(platformPost?.uiTokenAmount.amount || 0) -
      Number(platformPre?.uiTokenAmount.amount || 0);

    // Allow 1 lamport tolerance for rounding
    if (Math.abs(platformReceived - expectedPlatformFee) > 1) {
      return { valid: false, amountLamports: 0, platformFeeLamports: 0, creatorPayoutLamports: 0, buyerWallet: '', creatorWallet: '', error: `Platform fee mismatch: expected ${expectedPlatformFee}, got ${platformReceived}` };
    }

    // Find buyer (first signer)
    const accountKeys = tx.transaction.message.getAccountKeys();
    const buyerWallet = accountKeys.get(0)?.toBase58() || '';

    return {
      valid: true,
      amountLamports: expectedAmountLamports,
      platformFeeLamports: expectedPlatformFee,
      creatorPayoutLamports: expectedCreatorPayout,
      buyerWallet,
      creatorWallet: expectedCreatorWallet,
    };
  } catch (error) {
    return {
      valid: false,
      amountLamports: 0,
      platformFeeLamports: 0,
      creatorPayoutLamports: 0,
      buyerWallet: '',
      creatorWallet: '',
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

// ─── Build Generation Payment ────────────────────────────────

/**
 * Build a USDC transfer from bot to OpenFan for pay-per-image generation (Path B).
 */
export async function buildGenerationPayment(
  payerWallet: PublicKey,
  amountLamports: number
): Promise<{ transaction: string }> {
  const connection = getConnection();

  const payerAta = await getAssociatedTokenAddress(USDC_MINT, payerWallet);
  const platformAta = await getAssociatedTokenAddress(USDC_MINT, PLATFORM_WALLET);

  const transaction = new Transaction();

  transaction.add(
    createTransferInstruction(
      payerAta,
      platformAta,
      payerWallet,
      BigInt(amountLamports),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payerWallet;

  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  return {
    transaction: Buffer.from(serialized).toString('base64'),
  };
}

// ─── Verify Simple Transfer ──────────────────────────────────

/**
 * Verify a simple USDC transfer to the platform wallet (for generation payments).
 */
export async function verifyGenerationPayment(
  txSignature: string,
  expectedAmountLamports: number
): Promise<{ valid: boolean; error?: string }> {
  const connection = getConnection();

  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: 'finalized',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      return { valid: false, error: 'Transaction not found or failed' };
    }

    // Verify platform received the expected amount
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];

    const platformAddress = PLATFORM_WALLET.toBase58();
    const platformPost = postBalances.find(
      (b) => b.owner === platformAddress && b.mint === USDC_MINT.toBase58()
    );
    const platformPre = preBalances.find(
      (b) => b.owner === platformAddress && b.mint === USDC_MINT.toBase58()
    );

    const received =
      Number(platformPost?.uiTokenAmount.amount || 0) -
      Number(platformPre?.uiTokenAmount.amount || 0);

    if (Math.abs(received - expectedAmountLamports) > 1) {
      return { valid: false, error: `Payment mismatch: expected ${expectedAmountLamports}, got ${received}` };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Verification failed' };
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/** Convert USDC amount to lamports (6 decimals) */
export function usdcToLamports(usdc: number): number {
  return Math.floor(usdc * 10 ** USDC_DECIMALS);
}

/** Convert lamports to USDC display amount */
export function lamportsToUsdc(lamports: number): number {
  return lamports / 10 ** USDC_DECIMALS;
}

/** Get USDC balance for a wallet */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
  const connection = getConnection();
  const wallet = new PublicKey(walletAddress);
  const ata = await getAssociatedTokenAddress(USDC_MINT, wallet);

  try {
    const account = await getAccount(connection, ata);
    return Number(account.amount);
  } catch {
    return 0;
  }
}
