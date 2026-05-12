import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';

// ── DO NOT redeclare req.terminalSession here ─────────────
// terminal.types.ts already extends Express.Request with
// terminalSession?: TerminalSessionContext
// Redeclaring it here with a different shape causes TS2717.
// We import the type and use it directly instead.
import type { TerminalSessionContext } from '../modules/terminal/terminal.types.js';

const TERMINAL_COOKIE = 'terminal_session';

export async function attachTerminalSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken = req.cookies[TERMINAL_COOKIE];

  if (!sessionToken) {
    return next();
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        shop_id       AS "shopId",
        device_id     AS "deviceId",
        mode,
        authorized_by AS "authorizedBy"
      FROM terminal_sessions
      WHERE session_token = $1
        AND is_revoked    = FALSE
        AND (expires_at IS NULL OR expires_at > now())
      `,
      [sessionToken]
    );

    if (rows.length > 0) {
      // rows[0] matches TerminalSessionContext shape exactly
      req.terminalSession = rows[0] as TerminalSessionContext;

      pool.query(
        `UPDATE terminal_sessions SET last_seen_at = now() WHERE id = $1`,
        [rows[0].id]
      ).catch(err => console.error('Failed to update terminal last_seen_at:', err));
    } else {
      res.clearCookie(TERMINAL_COOKIE);
    }
  } catch (err) {
    console.error('[attachTerminalSession] DB error:', err);
  }

  next();
}

export function blockTerminalOnPlatformRoutes(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.terminalSession) {
    res.status(403).json({
      message:    'ERR_DEVICE_LOCKED_TO_MODE',
      mode:       req.terminalSession.mode,
      shopId:     req.terminalSession.shopId,
      redirectTo: `/${req.terminalSession.mode.toLowerCase()}/${req.terminalSession.shopId}`,
    });
    return;
  }

  const hasKitchenToken = !!req.cookies.kitchen_token;
  const hasPosToken     = !!req.cookies.pos_token;

  if (hasKitchenToken || hasPosToken) {
    const mode = hasKitchenToken ? 'KITCHEN' : 'POS';
    res.status(403).json({
      message:    'ERR_DEVICE_LOCKED_TO_MODE',
      mode,
      redirectTo: null,
    });
    return;
  }

  next();
}

export function requireTerminalSession(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.terminalSession) {
    res.status(401).json({ message: 'TERMINAL_NOT_AUTHENTICATED' });
    return;
  }
  next();
}