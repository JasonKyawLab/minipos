import { Request, Response }  from 'express';
import { TerminalService }    from './terminal.service.js';
import { TerminalRepository } from './terminal.repository.js';
import { UserRepository }     from '../user/user.repository.js';
import { AuthService }        from '../auth/auth.service.js';
import { AuditService }       from '../audit/audit.service.js';
import { comparePassword }    from '../../utils/password.js';
import { getParamAsString }   from '../../utils/converter.js';
import { handleError }        from '../../utils/handleError.js';
import { env }                from '../../config/validation.js';

const TERMINAL_COOKIE = 'terminal_session';
const ACCESS_COOKIE   = 'access_token';

const terminalCookieOptions = {
  httpOnly: true,
  secure:   env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge:   8 * 60 * 60 * 1000,
};

export class TerminalController {

 static async activate(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, 'shopId');
      
      // 1. SAFETY CHECK: Ensure req.user exists (Auth Middleware must be working)
      if (!req.user || !req.user.id) {
        return res.status(401).json({ 
          code: 'UNAUTHORIZED', 
          message: 'You must be logged in to activate a terminal.' 
        });
      }

      const requesterId = req.user.id;
      const { password, mode, device_id } = req.body;

      // 2. ACTIVATE VIA SERVICE
      const { sessionToken } = await TerminalService.activateTerminal({
        shopId,
        requesterId,
        password,
        mode,
        deviceId: device_id ?? null,
      });

      // 3. SET COOKIES
      // We set the terminal session
      res.cookie(TERMINAL_COOKIE, sessionToken, terminalCookieOptions);
      
      // CRITICAL: We MUST clear the access_token so the frontend 
      // Refresh logic knows we are strictly in Terminal Mode.
      res.clearCookie(ACCESS_COOKIE);

      return res.status(201).json({ success: true, mode });
    } catch (err) { 
      // This will now catch "Terminal not found" or "Invalid Password" 
      // from the Service instead of crashing.
      return handleError(res, err); 
    }
  }

  static async activateViaManagerPin(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, 'shopId');
      const { user_id, pin, mode, device_id } = req.body;

      const { sessionToken } = await TerminalService.activateViaManagerPin({
        shopId,
        userId:   user_id,
        pin,
        mode,
        deviceId: device_id ?? null,
      });

      res.cookie(TERMINAL_COOKIE, sessionToken, terminalCookieOptions);
      return res.status(201).json({ success: true, mode });
    } catch (err) { return handleError(res, err); }
  }

  static async activateViaEmergencyCode(req: Request, res: Response) {
    try {
      const shopId = getParamAsString(req.params.shopId, 'shopId');
      const { code, mode, device_id, user_id } = req.body;

      const { sessionToken } = await TerminalService.activateViaEmergencyCode({
        shopId,
        code,
        mode,
        userId:   user_id ?? null,
        deviceId: device_id ?? null,
      });

      res.cookie(TERMINAL_COOKIE, sessionToken, terminalCookieOptions);
      return res.status(201).json({ success: true, mode });
    } catch (err) { return handleError(res, err); }
  }

  // ── Exit terminal ─────────────────────────────────────────
  // Called FROM the terminal device. No access_token exists.
  // Identity is established via the terminal_session cookie.
  // Steps:
  //   1. Read terminal_session cookie → find who activated this device
  //   2. Verify their platform password
  //   3. Delete the session from DB
  //   4. Issue a new access_token so they land on the dashboard
  //   5. Clear all terminal cookies, set access_token cookie
  static async exit(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, 'shopId');
      const { password } = req.body;

      // ── Validate input ────────────────────────────────────
      if (!password || typeof password !== 'string' || password.trim() === '') {
        return res.status(400).json({ message: 'PASSWORD_REQUIRED' });
      }

      // ── Check for terminal session cookie ─────────────────
      const sessionToken = req.cookies[TERMINAL_COOKIE];
      if (!sessionToken) {
        // No session cookie — just clear everything and let client redirect.
        // This handles the case where the session already expired.
        res.clearCookie(TERMINAL_COOKIE);
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');
        return res.status(400).json({ message: 'NO_ACTIVE_MODE_SESSION' });
      }

      // ── Find the terminal session ─────────────────────────
      const session = await TerminalRepository.findActiveSession(sessionToken);
      if (!session) {
        // Session is in the cookie but not in DB (revoked or expired).
        res.clearCookie(TERMINAL_COOKIE);
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');
        return res.status(401).json({ message: 'TERMINAL_SESSION_INVALID' });
      }

      // Scope check: terminal session must belong to the requested shop
      if (session.shop_id !== shopId) {
        return res.status(403).json({ message: 'TERMINAL_SHOP_MISMATCH' });
      }

      // ── Verify the activating user's password ─────────────
      // The terminal was activated by authorized_by.
      // Only that person (or another OWNER/MANAGER) should be able to exit.
      // We verify against authorized_by for simplicity.
      const user = await UserRepository.findById(session.authorized_by);
      if (!user || user.is_deleted) {
        return res.status(404).json({ message: 'USER_NOT_FOUND' });
      }

      const isValid = await comparePassword(password, user.password_hash);
      if (!isValid) {
        await AuditService.log({
          shopId,
          userId: session.authorized_by,
          action: 'TERMINAL_EXIT_PASSWORD_FAILED',
          entity: 'TERMINAL_SESSION',
          entityId: session.id,
        });
        return res.status(401).json({ message: 'INVALID_PASSWORD' });
      }

      // ── Delete the terminal session ───────────────────────
      await TerminalRepository.deleteSession(sessionToken);

      // ── Issue a fresh platform access_token ───────────────
      // The owner successfully exited — re-authenticate them on
      // the platform so they land on the dashboard without re-logging in.
      const newAccessToken = await AuthService.issueTokenForUser(user.id);

      // ── Clear terminal cookies, set platform cookie ───────
      res.clearCookie(TERMINAL_COOKIE);
      res.clearCookie('pos_token');
      res.clearCookie('kitchen_token');

      res.cookie(ACCESS_COOKIE, newAccessToken, {
        httpOnly: true,
        secure:   env.NODE_ENV === 'production',
        sameSite: 'lax', // lax for cross-page navigation after redirect
        maxAge:   24 * 60 * 60 * 1000,
      });

      await AuditService.log({
        shopId,
        userId:   user.id,
        action:   'TERMINAL_EXITED',
        entity:   'TERMINAL_SESSION',
        entityId: session.id,
        metadata: { mode: session.mode },
      });

      return res.status(200).json({ success: true });

    } catch (err) { return handleError(res, err); }
  }

  static async generateEmergencyCode(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.user!.id;
      const { mode }    = req.body;

      const result = await TerminalService.generateEmergencyCode({
        shopId,
        requesterId,
        mode,
      });

      return res.status(201).json({
        ...result,
        warning: 'This code will not be shown again. Show it to your staff now.',
      });
    } catch (err) { return handleError(res, err); }
  }

  static async listSessions(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.user!.id;
      const sessions    = await TerminalService.getActiveSessions(shopId, requesterId);
      return res.json(sessions);
    } catch (err) { return handleError(res, err); }
  }

  static async revokeSession(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,    'shopId');
      const sessionId   = getParamAsString(req.params.sessionId, 'sessionId');
      const requesterId = req.user!.id;

      const result = await TerminalService.revokeSession({
        sessionId,
        requesterId,
        shopId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }
}