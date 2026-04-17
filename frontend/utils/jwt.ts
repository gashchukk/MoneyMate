/**
 * Read user_id from JWT access token payload (no signature verification — UI hint only).
 */

export function getUserIdFromJwt(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    if (pad) base64 += '='.repeat(4 - pad);
    const payload = JSON.parse(atob(base64)) as { user_id?: number };
    const id = payload.user_id;
    return typeof id === 'number' ? id : null;
  } catch {
    return null;
  }
}
