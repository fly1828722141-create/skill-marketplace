import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isDashboardOwnerEmail } from '@/lib/dashboard-access';
import { getSkillIngestConfig } from '@/lib/ingest-config';

export interface IngestActor {
  triggerType: 'admin' | 'cron' | 'hmac';
  triggerLabel: string;
  userId?: string;
}

function normalizeHeaderValue(value: string | null): string {
  return (value || '').trim();
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseBearerToken(authHeader: string): string {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function normalizeSignature(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('sha256=') ? trimmed.slice(7) : trimmed;
}

function verifyHmacSignature(options: {
  secret: string;
  timestamp: string;
  payload: string;
  signature: string;
  maxSkewSeconds: number;
}): boolean {
  const { secret, timestamp, payload, signature, maxSkewSeconds } = options;
  if (!secret || !timestamp || !signature) return false;

  const timestampMs = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return false;
  }

  const nowMs = Date.now();
  const skewSeconds = Math.abs(nowMs - timestampMs) / 1000;
  if (skewSeconds > maxSkewSeconds) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const normalized = normalizeSignature(signature);
  return safeCompare(expected, normalized);
}

export async function resolveIngestActor(
  request: NextRequest,
  rawBody = ''
): Promise<IngestActor | null> {
  const config = getSkillIngestConfig();

  const bearerToken = parseBearerToken(normalizeHeaderValue(request.headers.get('authorization')));
  if (config.cronSecret && bearerToken && safeCompare(config.cronSecret, bearerToken)) {
    return {
      triggerType: 'cron',
      triggerLabel: 'vercel-cron',
    };
  }

  const timestamp = normalizeHeaderValue(request.headers.get('x-ingest-timestamp'));
  const signature = normalizeHeaderValue(request.headers.get('x-ingest-signature'));
  if (
    verifyHmacSignature({
      secret: config.hmacSecret,
      timestamp,
      payload: rawBody,
      signature,
      maxSkewSeconds: config.hmacMaxSkewSeconds,
    })
  ) {
    return {
      triggerType: 'hmac',
      triggerLabel: 'ingest-hmac',
    };
  }

  const currentUser = await getCurrentUser();
  if (currentUser && isDashboardOwnerEmail(currentUser.email)) {
    return {
      triggerType: 'admin',
      triggerLabel: currentUser.email || 'admin',
      userId: currentUser.id,
    };
  }

  return null;
}

export async function requireAdminIngestActor(request: NextRequest): Promise<IngestActor | null> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isDashboardOwnerEmail(currentUser.email)) {
    return null;
  }

  return {
    triggerType: 'admin',
    triggerLabel: currentUser.email || 'admin',
    userId: currentUser.id,
  };
}
