interface CachedSession {
  token: string;
  expiry: number; // Unix ms
}

let cachedSession: CachedSession | null = null;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function getCachedSession(): string | null {
  if (!cachedSession) return null;
  // Refresh 1 day before expiry
  if (Date.now() > cachedSession.expiry - ONE_DAY_MS) {
    cachedSession = null;
    return null;
  }
  return cachedSession.token;
}

// expiryUnixSec is an absolute Unix timestamp in seconds (as returned by Google)
export function setCachedSession(token: string, expiryUnixSec: number): void {
  cachedSession = {
    token,
    expiry: expiryUnixSec * 1000, // convert to ms
  };
}
