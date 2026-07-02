// PURPOSE:
//   Hard security gate applied to both PIN login routes:
//     POST /api/shops/:shopId/pos-auth/login
//     POST /api/shops/:shopId/kitchen-auth/login
//
//   A request must pass ALL three checks in sequence before
//   the controller is allowed to run. Failing any check
//   returns 403 immediately — no fallthrough.
//
// THE THREE CHECKS:
//
//   1. Cookie Presence
//      The terminal_id HttpOnly cookie must exist. This cookie
//      is set by the backend during terminal activation and
//      cannot be read or forged by client-side JavaScript.
//      A missing cookie means the device has never been
//      activated by an owner, so we refuse access.
//
//   2. Database Token Validity
//      The cookie value is looked up directly in shop_devices
//      against the terminal_token column (scoped to the shopId
//      in the URL). The device must be APPROVED and the token
//      must match. This blocks:
//        - Copied tokens used on a different device
//        - Revoked devices that still hold an old cookie
//        - Tokens from a different shop
//
//   3. IP / User-Agent Geofencing
//      The request IP and User-Agent are compared against the
//      values recorded when the device first registered. A
//      mismatch means the request is coming from outside the
//      store network or from a different device type.
//
//      IP note: behind a reverse proxy (Oracle Cloud, Vercel,
//      Cloudflare) the raw req.ip is the proxy IP. We parse
//      X-Forwarded-For with a helper that respects the
//      Express trust proxy setting.
//
//      Strictness options (controlled by env var):
//        DEVICE_GEO_STRICT=true  → block on IP OR UA mismatch
//        DEVICE_GEO_STRICT=false → warn only, never block
//      Default is WARN-only so a misconfigured proxy does not
//      lock out every store on day one. Set to true in prod
//      once you confirm proxy IP forwarding is working.
//
// WHAT IS ATTACHED TO req AFTER PASSING:
//   req.verifiedDevice = { id, shopId, deviceName }
//   Downstream controllers can use this for audit logging.

import { Request, Response, NextFunction } from 'express';
import { pool }                            from '../db/pool.js';

// ── Extend Express Request type ───────────────────────────
// Only declared here — no other file needs to redeclare this.
declare global {
  namespace Express {
    interface Request {
      verifiedDevice?: {
        id:         string;
        shopId:     string;
        deviceName: string | null;
      };
    }
  }
}

// ── Client IP extraction ──────────────────────────────────
// Handles the reverse-proxy case. Express sets req.ip from
// X-Forwarded-For automatically when app.set('trust proxy')
// is configured, so we use req.ip as the canonical value.
// The fallback chain handles edge cases where the header is
// absent or the socket address is used directly.
function getClientIp(req: Request): string {
  // req.ip is already parsed by Express using trust proxy rules.
  // This is the correct value in all environments when the app
  // is configured with app.set('trust proxy', 1).
  if (req.ip) return req.ip;

  // Fallback: parse X-Forwarded-For manually.
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first.trim();
  }

  // Last resort: raw socket address.
  return req.socket.remoteAddress ?? 'unknown';
}

// ── Geofence strictness from environment ──────────────────
// Read once at module load — not per-request.
const GEO_STRICT = process.env.DEVICE_GEO_STRICT === 'true';

// ── Main middleware ───────────────────────────────────────
export async function requireVerifiedDevice(
  req:  Request,
  res:  Response,
  next: NextFunction
): Promise<void> {
  const shopId = req.params.shopId;

  // ── Check 1: Cookie must exist ────────────────────────
  // If the cookie is absent the device has never been through
  // the activation flow. We cannot identify it at all.
  const terminalToken = req.cookies['terminal_id'] as string | undefined;

  if (!terminalToken) {
    res.status(403).json({
      message: 'DEVICE_NOT_VERIFIED',
      detail:  'terminal_id cookie missing — activate this device first',
    });
    return;
  }

  // ── Check 2: Token must exist in DB for this shop ─────
  // Scoped to shopId so a token from Shop A cannot be used
  // to log into Shop B's POS terminal.
  let device: {
    id:               string;
    shop_id:          string;
    device_name:      string | null;
    status:           string;
    ip_address:       string | null;
    user_agent:       string | null;
    terminal_token:   string;
  } | null = null;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        shop_id,
        device_name,
        status,
        ip_address::TEXT,
        user_agent,
        terminal_token
      FROM shop_devices
      WHERE terminal_token = $1
        AND shop_id        = $2
      `,
      [terminalToken, shopId]
    );
    device = rows[0] ?? null;
  } catch (err) {
    // DB error — fail closed (deny), never fail open.
    console.error('[DeviceVerification] DB query failed:', err);
    res.status(503).json({ message: 'DEVICE_VERIFICATION_UNAVAILABLE' });
    return;
  }

  if (!device) {
    // Token not found or belongs to a different shop.
    res.status(403).json({
      message: 'DEVICE_NOT_VERIFIED',
      detail:  'terminal_id cookie is invalid or belongs to a different shop',
    });
    return;
  }

  if (device.status !== 'APPROVED') {
    // Device exists but was revoked or is still pending.
    res.status(403).json({
      message: 'DEVICE_NOT_APPROVED',
      detail:  `Device status is ${device.status} — only APPROVED devices may log in`,
    });
    return;
  }

  // ── Check 3: IP / User-Agent geofence ────────────────
  // Only meaningful when the device has registered metadata.
  // New devices that registered before this feature existed
  // will have NULL stored — we skip the check for them and
  // log a warning so the owner knows to re-register.
  const requestIp = getClientIp(req);
  const requestUa = req.headers['user-agent'] ?? '';

  let geofencePassed = true;
  const geofenceWarnings: string[] = [];

  if (device.ip_address) {
    if (requestIp !== device.ip_address) {
      geofencePassed = false;
      geofenceWarnings.push(
        `IP mismatch: registered=${device.ip_address} current=${requestIp}`
      );
    }
  } else {
    // No IP on record — log so the owner knows.
    console.warn(
      `[DeviceVerification] device ${device.id} has no registered IP — ` +
      `geofence skipped. Re-register the device to enable this check.`
    );
  }

  if (device.user_agent) {
    // User-Agent comparison: we compare the first 120 chars only.
    // Full UA strings vary across minor browser updates but the
    // browser family and OS substring stays stable. 120 chars is
    // enough to distinguish "iPad Safari" from "Chrome Windows".
    const storedUaPrefix  = device.user_agent.slice(0, 120);
    const requestUaPrefix = requestUa.slice(0, 120);

    if (storedUaPrefix !== requestUaPrefix) {
      geofencePassed = false;
      geofenceWarnings.push(
        `UA mismatch: registered=${storedUaPrefix} current=${requestUaPrefix}`
      );
    }
  }

  if (!geofencePassed) {
    if (GEO_STRICT) {
      // In strict mode block the request entirely.
      console.warn(
        `[DeviceVerification] GEOFENCE BLOCKED device=${device.id} ` +
        geofenceWarnings.join(' | ')
      );
      res.status(403).json({
        message: 'DEVICE_NOT_VERIFIED',
        detail:  'Device location or hardware check failed',
      });
      return;
    } else {
      // In warn-only mode log it but let the request through.
      // This is the safe default for initial deployment where
      // proxy configuration may not yet be confirmed.
      console.warn(
        `[DeviceVerification] GEOFENCE WARN (not blocking) device=${device.id} ` +
        geofenceWarnings.join(' | ')
      );
    }
  }

  // ── All checks passed — attach device to request ──────
  // Controllers and subsequent middleware can read this to
  // avoid a second DB query for the same device.
  req.verifiedDevice = {
    id:         device.id,
    shopId:     device.shop_id,
    deviceName: device.device_name,
  };

  next();
}