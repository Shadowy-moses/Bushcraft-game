/**
 * Save backend. localStorage works in mobile Safari and in a Capacitor
 * WKWebView, so a later native wrap does not need a new save format.
 * Callers never touch localStorage themselves.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Private mode and some webviews refuse writes. The game still runs. */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
