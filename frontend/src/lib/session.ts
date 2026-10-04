/**
 * Reads the `exp` / `iat` claims out of the stored access token so Settings
 * can say when the session ends. This only DECODES the payload — it does not
 * and cannot verify the signature (the secret lives on the backend), so it is
 * display-only; the server remains the sole authority on whether a token is
 * valid. Returns null for anything that isn't a decodable JWT.
 */
export interface SessionInfo {
  issuedAt: Date | null;
  expiresAt: Date | null;
}

export function decodeSession(token: string | null): SessionInfo | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { exp?: unknown; iat?: unknown };
    const toDate = (value: unknown) => (typeof value === "number" ? new Date(value * 1000) : null);
    return { issuedAt: toDate(claims.iat), expiresAt: toDate(claims.exp) };
  } catch {
    return null;
  }
}

/** "in 6d 4h", "in 12m", or "expired" — relative to `now`. */
export function formatTimeRemaining(expiresAt: Date, now: number = Date.now()): string {
  const ms = expiresAt.getTime() - now;
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "in under a minute";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}
