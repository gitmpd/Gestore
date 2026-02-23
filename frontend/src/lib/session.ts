export const SESSION_ACTIVITY_KEY = 'gs:last-activity-at';
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const SESSION_CHECK_INTERVAL_MS = 30 * 1000;
export const SESSION_ACTIVITY_THROTTLE_MS = 10 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function writeSessionActivityAt(timestamp: number): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SESSION_ACTIVITY_KEY, String(timestamp));
}

export function readSessionActivityAt(): number | null {
  if (!isBrowser()) return null;
  const value = window.localStorage.getItem(SESSION_ACTIVITY_KEY);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clearSessionActivity(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SESSION_ACTIVITY_KEY);
}

export function getJwtExpiryMs(token: string | null): number | null {
  if (!token || token === 'offline-token') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp || typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}
