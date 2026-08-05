/**
 * The auth surface's reading of its own query string.
 *
 * `safeRedirect` in particular was five byte-identical copies, one per auth
 * page — a rule about where the creator may be sent after signing in, with no
 * single place to change it and no way to test it without mounting a page.
 */

/**
 * The post-auth destination, or null when there isn't a usable one.
 *
 * Only same-origin paths survive: a value must start with a single `/`. A
 * protocol-relative `//host` would send the creator off-site, so it is
 * rejected alongside absolute URLs.
 */
export function safeRedirect(search: string): string | null {
  const raw = new URLSearchParams(search).get("redirect");
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}

/** The Firebase out-of-band code carried by an emailed action link. */
export function readOobCode(search: string): string | null {
  const code = new URLSearchParams(search).get("oobCode");
  return code ? code.trim() : null;
}

/** Which action an emailed link claims to be — `resetPassword`, `verifyEmail`. */
export function readActionMode(search: string): string | null {
  const mode = new URLSearchParams(search).get("mode");
  return mode ? mode.trim() : null;
}
