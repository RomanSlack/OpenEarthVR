interface CachedSession {
  token: string;
  expiry: number; // absolute Unix ms
}

let cachedSession: CachedSession | null = null;
// In-flight createSession promise — deduplicate concurrent callers
let inFlight: Promise<string> | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getCachedSession(): string | null {
  if (!cachedSession) return null;
  // Treat as expired 1 day before actual expiry so we never send a nearly-dead token
  if (Date.now() > cachedSession.expiry - ONE_DAY_MS) {
    cachedSession = null;
    return null;
  }
  return cachedSession.token;
}

export function setCachedSession(token: string, expiryUnixSec: number): void {
  cachedSession = { token, expiry: expiryUnixSec * 1000 };
}

export function clearCachedSession(): void {
  cachedSession = null;
}

export function getInFlight(): Promise<string> | null {
  return inFlight;
}

export function setInFlight(p: Promise<string> | null): void {
  inFlight = p;
}
