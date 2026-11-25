/**
 * Resolve a user-supplied post-action redirect target to a same-origin path.
 *
 * `new URL(target, base)` happily resolves absolute URLs (`https://evil.example`)
 * and protocol-relative ones (`//evil.example`, `/\evil.example`, and `/\t/evil.example`
 * after the URL parser strips the tab) to another host, which turns any
 * `?redirect=` parameter into an open redirect. This accepts only a target that
 * starts with `/` AND still resolves to `base`'s origin, and returns the path,
 * query and hash. Anything else yields `fallback`.
 */
export function safeRedirectPath(
  target: string | null | undefined,
  base: string | URL,
  fallback = "/dashboard"
): string {
  if (!target || !target.startsWith("/")) return fallback;
  let resolved: URL;
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
    resolved = new URL(target, baseUrl);
  } catch {
    return fallback;
  }
  if (resolved.origin !== baseUrl.origin) return fallback;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
