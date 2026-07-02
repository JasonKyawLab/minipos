// Purpose: The gateway that all terminal routes pass through.
// This replaces requireApprovedDevice for terminal operations.
//
// Why this approach?
//   The old middleware trusted X-Device-Key (client-controlled).
//   This middleware trusts only the HttpOnly cookie (server-issued).
//   The cookie cannot be read by JavaScript — XSS cannot steal it.

import { Request, Response, NextFunction } from 'express';
import { TerminalRepository } from './terminal.repository.js';
import { appError } from '../../utils/appError.js';

const TERMINAL_COOKIE = 'terminal_session';

export async function requireTerminalSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionToken = req.cookies[TERMINAL_COOKIE];

  if (!sessionToken) {
    res.status(401).json({ message: 'TERMINAL_NOT_AUTHENTICATED' });
    return;
  }

  try {
    const session = await TerminalRepository.findActiveSession(sessionToken);

    if (!session) {
      // Session doesn't exist, was revoked, or expired.
      // Clear the dead cookie so the client knows to re-authenticate.
      res.clearCookie(TERMINAL_COOKIE);
      res.status(401).json({ message: 'TERMINAL_SESSION_INVALID' });
      return;
    }

    // Validate shop scope: terminal cannot access another shop's data
    const shopId = req.params.shopId;
    if (shopId && session.shop_id !== shopId) {
      res.status(403).json({ message: 'TERMINAL_SHOP_MISMATCH' });
      return;
    }

    // Attach context for downstream handlers
    req.terminalSession = {
      id:           session.id,
      shopId:       session.shop_id,
      deviceId:     session.device_id,
      mode:         session.mode,
      authorizedBy: session.authorized_by,
    };

    // AUDIT CHECKLIST: Update heartbeat on every request.
    // Fire-and-forget — don't block the request on this.
    TerminalRepository.touchSession(session.id)
      .catch(err => console.error('Failed to touch terminal session:', err));

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Mode guard — ensures the terminal is in the correct mode
 * for the route being accessed.
 * 
 * Usage: router.use(requireTerminalMode('POS'))
 * A kitchen terminal cannot access POS routes and vice versa.
 */
export function requireTerminalMode(mode: 'POS' | 'KITCHEN') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.terminalSession) {
      res.status(401).json({ message: 'TERMINAL_NOT_AUTHENTICATED' });
      return;
    }
    if (req.terminalSession.mode !== mode) {
      res.status(403).json({ message: 'TERMINAL_MODE_MISMATCH' });
      return;
    }
    next();
  };
}