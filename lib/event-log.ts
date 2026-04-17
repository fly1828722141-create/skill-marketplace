import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export interface RecordEventInput {
  eventName: string;
  page?: string;
  module?: string;
  action?: string;
  userId?: string | null;
  skillId?: string | null;
  categoryId?: string | null;
  sessionId?: string | null;
  anonymousId?: string | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeString(input: unknown, maxLength: number): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeMetadata(
  input: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  try {
    // 确保 metadata 可序列化，避免 Prisma Json 入库失败
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

async function captureToPosthog(input: RecordEventInput) {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  const host = process.env.POSTHOG_HOST;

  if (!apiKey || !host) {
    return;
  }

  const distinctId =
    input.userId || input.anonymousId || input.sessionId || 'anonymous';
  const url = `${host.replace(/\/$/, '')}/capture/`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        event: input.eventName,
        distinct_id: distinctId,
        properties: {
          page: input.page || null,
          module: input.module || null,
          action: input.action || null,
          skillId: input.skillId || null,
          categoryId: input.categoryId || null,
          ...(input.metadata || {}),
        },
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // 第三方埋点失败不应影响主流程
  }
}

export async function recordEvent(input: RecordEventInput) {
  const eventName = normalizeString(input.eventName, 80);
  if (!eventName) {
    return false;
  }

  const data = {
    eventName,
    page: normalizeString(input.page, 200),
    module: normalizeString(input.module, 80),
    action: normalizeString(input.action, 80),
    userId: normalizeString(input.userId, 60),
    skillId: normalizeString(input.skillId, 60),
    categoryId: normalizeString(input.categoryId, 60),
    sessionId: normalizeString(input.sessionId, 80),
    anonymousId: normalizeString(input.anonymousId, 80),
    metadata: normalizeMetadata(input.metadata),
  };

  try {
    await prisma.eventLog.create({ data });
    void captureToPosthog({
      ...input,
      eventName,
      metadata: data.metadata as Record<string, unknown> | undefined,
    });
    return true;
  } catch (error) {
    console.error('记录埋点失败:', error);
    return false;
  }
}
