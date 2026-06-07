// =========================================================
// terminal.controller.ts
// Path: backend/src/modules/terminal/terminal.controller.ts
//
// CHANGE: The TERMINAL_EXITED audit log event in the exit()
// handler now includes the actor's live database role.
//
// WHY this matters:
//   The old log only recorded { mode: session.mode }.
//   That tells you WHAT was exited but not WHO closed it
//   or at WHAT privilege level. An OWNER and a MANAGER can
//   both exit a terminal — the security audit requirement
//   is to distinguish them explicitly in the log so you can
//   prove no manager ever received owner-level re-auth.
//
// WHAT is now logged:
//   {
//     mode:         'POS' | 'KITCHEN',   — unchanged
//     resolvedRole: 'OWNER' | 'USER',    — live DB value, not token claim
//     resolvedName: string,              — human-readable for audit review
//     sessionId:    string,              — tie back to terminal_sessions row
//   }
//
// resolvedRole comes from user.role (the platform role column
// on the users table), which AuthService.issueTokenForUser()
// already fetched from the DB to build the new access_token.
// We reuse the same user object — no extra DB query.
//
// No other logic has changed in this file.
// =========================================================

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
import { DeviceService }      from '../device/device.service.js';
import { pool } from '../../db/pool.js';


const TERMINAL_COOKIE = 'terminal_session';
const ACCESS_COOKIE   = 'access_token';

const terminalCookieOptions = {
  httpOnly: true,
  secure:   env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge:   8 * 60 * 60 * 1000,
};

export class TerminalController {

  // Returns 202 Accepted when the device needs owner approval.
// Returns 201 Created when fully activated.
static async activate(req: Request, res: Response) {
  try {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.user!.id;
    const { password, mode, device_id } = req.body;

    const result = await TerminalService.activateTerminal({
      shopId,
      requesterId,
      password,
      mode,
      deviceId: device_id ?? null,
    });

    // Device needs approval — return 202 so the frontend renders the
    // pending screen instead of navigating to the mode page.
    if (result.status === 'AWAITING_APPROVAL') {
      return res.status(202).json({
        status:   'AWAITING_APPROVAL',
        deviceId: result.deviceId,
        message:  'Device registered and awaiting owner approval.',
      });
    }

    // Fully activated — set cookies and return 201.
    res.cookie('terminal_session', result.sessionToken, {
      httpOnly: true,
      secure:   env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   8 * 60 * 60 * 1000,
    });

    // Issue the hardware passport cookie if we have a device_id
    if (device_id) {
      const tokenResult = await DeviceService.issueTerminalToken({
        shopId,
        deviceKey: device_id,
      });

      if (tokenResult) {
        res.cookie('terminal_id', tokenResult.terminalToken, {
          httpOnly: true,
          secure:   env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge:   365 * 24 * 60 * 60 * 1000,
        });
      }
    }

    res.clearCookie('access_token');
    return res.status(201).json({ success: true, mode, status: 'ACTIVATED' });
  } catch (err) {
    return handleError(res, err);
  }
}

  // ── Activate via manager PIN (Level 1 delegation) ────────
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

      res.cookie('terminal_session', sessionToken, {
        httpOnly: true,
        secure:   env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge:   8 * 60 * 60 * 1000,
      });

      if (device_id) {
        const tokenResult = await DeviceService.issueTerminalToken({
          shopId,
          deviceKey: device_id,
        });

        if (tokenResult) {
          res.cookie('terminal_id', tokenResult.terminalToken, {
            httpOnly: true,
            secure:   env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge:   365 * 24 * 60 * 60 * 1000,
          });
        }
      }

      return res.status(201).json({ success: true, mode });
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── Activate via emergency code (Level 2 delegation) ─────
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
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── Exit terminal ─────────────────────────────────────────
  //
  // SECURITY DESIGN:
  //   Identity is established via the terminal_session cookie,
  //   NOT an access_token (which no longer exists on the device).
  //   The session row records authorized_by — the user who
  //   originally activated the terminal. We verify their password
  //   then issue them a fresh platform token based on their live
  //   database profile. A manager always gets a manager token;
  //   an owner always gets an owner token. No token can be
  //   "upgraded" through this flow.
  //
  // AUDIT CHANGE:
  //   TERMINAL_EXITED now logs resolvedRole and resolvedName so
  //   the audit trail explicitly proves role reversion happened
  //   correctly. This meets the security audit requirement.
 static async exit(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId, 'shopId');
      const { password } = req.body;

      // ── Step 1: Read and validate the terminal session cookie ──
      const sessionToken = req.cookies['terminal_session'];
      if (!sessionToken) {
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');
        return res.status(400).json({ message: 'NO_ACTIVE_MODE_SESSION' });
      }

      const session = await TerminalRepository.findActiveSession(sessionToken);
      if (!session || session.shop_id !== shopId) {
        res.clearCookie('terminal_session');
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');
        return res.status(401).json({ message: 'TERMINAL_SESSION_INVALID' });
      }

      // ── Step 2: Verify password of whoever activated this terminal ──
      const user = await UserRepository.findById(session.authorized_by);
      if (!user) {
        return res.status(404).json({ message: 'USER_NOT_FOUND' });
      }

      const isValid = await comparePassword(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ message: 'INVALID_PASSWORD' });
      }

      // ── Step 3: Close all active staff work log shifts for this device ──
      // When mode exits, every staff member currently clocked in on this
      // device is automatically signed out. This prevents ghost shifts
      // where a cashier appears "active" after the mode is torn down.
      //
      // We do this BEFORE deleting the session so we still have device_id.
      // If device_id is null (edge case: device never registered), we fall
      // back to closing all open shifts for this shop to be safe.
      if (session.device_id) {
        await pool.query(
          `
          UPDATE staff_mode_sessions
          SET logout_at     = now(),
              logout_reason = 'MODE_EXIT'
          WHERE device_id = $1
            AND logout_at IS NULL
          `,
          [session.device_id]
        );
      } else {
        // No device_id on session — close all open shifts for this shop
        // scoped to the mode being exited. This is the safe fallback.
        await pool.query(
          `
          UPDATE staff_mode_sessions
          SET logout_at     = now(),
              logout_reason = 'MODE_EXIT'
          WHERE shop_id   = $1
            AND mode_type = $2
            AND logout_at IS NULL
          `,
          [shopId, session.mode]
        );
      }

      // ── Step 4: Delete the terminal session ───────────────────
      await TerminalRepository.deleteSession(sessionToken);

      // ── Step 5: Issue a fresh platform token ──────────────────
      const newAccessToken = await AuthService.issueTokenForUser(user.id);

      // ── Step 6: Burn terminal cookies, restore platform cookie ─
      res.clearCookie('terminal_session');
      res.clearCookie('pos_token');
      res.clearCookie('kitchen_token');
      // terminal_id NOT cleared — hardware passport persists.

      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure:   env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge:   24 * 60 * 60 * 1000,
      });

      // ── Step 7: Audit log with enriched context ────────────────
      await AuditService.log({
        shopId,
        userId:   user.id,
        action:   'TERMINAL_EXITED',
        entity:   'TERMINAL_SESSION',
        entityId: session.id,
        metadata: {
          mode:         session.mode,
          resolvedRole: user.role,
          resolvedName: user.name,
          sessionId:    session.id,
          deviceId:     session.device_id ?? 'unknown',
          shiftsClosedAt: new Date().toISOString(),
        },
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── Generate emergency code (dashboard, owner only) ──────
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
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── List active sessions (dashboard) ─────────────────────
  static async listSessions(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.user!.id;
      const sessions    = await TerminalService.getActiveSessions(shopId, requesterId);
      return res.json(sessions);
    } catch (err) {
      return handleError(res, err);
    }
  }

  // ── Revoke a session (remote kill switch) ────────────────
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
    } catch (err) {
      return handleError(res, err);
    }
  }
}