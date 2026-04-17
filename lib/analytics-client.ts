'use client';

const ANONYMOUS_ID_KEY = 'skill_marketplace_anonymous_id';
const SESSION_ID_KEY = 'skill_marketplace_session_id';

function generateId(prefix: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

function getOrCreateStorageValue(key: string, storage: Storage, prefix: string) {
  const cached = storage.getItem(key);
  if (cached) {
    return cached;
  }
  const created = generateId(prefix);
  storage.setItem(key, created);
  return created;
}

export function getTrackingIdentity() {
  if (typeof window === 'undefined') {
    return {
      anonymousId: null,
      sessionId: null,
    };
  }

  const anonymousId = getOrCreateStorageValue(
    ANONYMOUS_ID_KEY,
    window.localStorage,
    'anon'
  );
  const sessionId = getOrCreateStorageValue(
    SESSION_ID_KEY,
    window.sessionStorage,
    'sess'
  );

  return {
    anonymousId,
    sessionId,
  };
}

export interface TrackEventPayload {
  eventName: string;
  page?: string;
  module?: string;
  action?: string;
  skillId?: string;
  categoryId?: string;
  metadata?: Record<string, unknown>;
}

export function trackEvent(payload: TrackEventPayload) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!payload.eventName) {
    return;
  }

  const identity = getTrackingIdentity();
  const body = JSON.stringify({
    ...payload,
    page: payload.page || window.location.pathname,
    anonymousId: identity.anonymousId,
    sessionId: identity.sessionId,
    metadata: payload.metadata || {},
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/track', blob);
      return;
    }
  } catch {
    // ignore sendBeacon failure and fallback to fetch
  }

  fetch('/api/analytics/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
    keepalive: true,
  }).catch(() => {
    // ignore analytics errors in UI thread
  });
}
