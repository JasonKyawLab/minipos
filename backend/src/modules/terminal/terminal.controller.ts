import { Request, Response }  from 'express';
import { TerminalService }    from './terminal.service.js';
import { getParamAsString }   from '../../utils/converter.js';
import { asyncHandler }       from '../../utils/asyncHandler.js';
import { env }                from '../../config/validation.js';
import { DeviceService }      from '../device/device.service.js';

const TERMINAL_COOKIE = 'terminal_session';

const terminalCookieOptions = {
  httpOnly: true,
  secure:   env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge:   8 * 60 * 60 * 1000,
};

export class TerminalController {

  // Returns 202 Accepted when the device needs owner approval.
  // Returns 201 Created when fully activated.
  static activate = asyncHandler(async (req: Request, res: Response) => {
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

    if (result.status === 'AWAITING_APPROVAL') {
      return res.status(202).json({
        status:   'AWAITING_APPROVAL',
        deviceId: result.deviceId,
        message:  'Device registered and awaiting owner approval.',
      });
    }

    res.cookie('terminal_session', result.sessionToken, {
      httpOnly: true,
      secure:   env.NODE_ENV === 'production',
      sameSite: 'strict',
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
          sameSite: 'lax',
          maxAge:   365 * 24 * 60 * 60 * 1000,
        });
      }
    }

    res.clearCookie('access_token');
    res.status(201).json({ success: true, mode, status: 'ACTIVATED' });
  });

  // ── Activate via manager PIN (Level 1 delegation) ────────
  static activateViaManagerPin = asyncHandler(async (req: Request, res: Response) => {
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

    res.status(201).json({ success: true, mode });
  });

  // ── Activate via emergency code (Level 2 delegation) ─────
  static activateViaEmergencyCode = asyncHandler(async (req: Request, res: Response) => {
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
    res.status(201).json({ success: true, mode });
  });

  // ── Exit terminal ─────────────────────────────────────────
  static exit = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId, 'shopId');
    const { password } = req.body;
    const sessionToken = req.cookies['terminal_session'] ?? null;

    const result = await TerminalService.exitTerminal({ shopId, sessionToken, password });

    switch (result.status) {
      case 'NO_SESSION':
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');
        return res.status(400).json({ message: 'NO_ACTIVE_MODE_SESSION' });

      case 'SESSION_INVALID':
        res.clearCookie('terminal_session');
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');
        return res.status(401).json({ message: 'TERMINAL_SESSION_INVALID' });

      case 'USER_NOT_FOUND':
        return res.status(404).json({ message: 'USER_NOT_FOUND' });

      case 'INVALID_PASSWORD':
        return res.status(401).json({ message: 'INVALID_PASSWORD' });

      case 'SUCCESS': {
        // Burn terminal cookies, restore platform cookie.
        // terminal_id NOT cleared — hardware passport persists.
        res.clearCookie('terminal_session');
        res.clearCookie('pos_token');
        res.clearCookie('kitchen_token');

        res.cookie('access_token', result.newAccessToken, {
          httpOnly: true,
          secure:   env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge:   24 * 60 * 60 * 1000,
        });

        return res.status(200).json({ success: true });
      }
    }
  });

  // ── Generate emergency code (dashboard, owner only) ──────
  static generateEmergencyCode = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.user!.id;
    const { mode }    = req.body;

    const result = await TerminalService.generateEmergencyCode({
      shopId,
      requesterId,
      mode,
    });

    res.status(201).json({
      ...result,
      warning: 'This code will not be shown again. Show it to your staff now.',
    });
  });

  // ── List active sessions (dashboard) ─────────────────────
  static listSessions = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.user!.id;
    const sessions    = await TerminalService.getActiveSessions(shopId, requesterId);
    res.json(sessions);
  });

  // ── Revoke a session (remote kill switch) ────────────────
  static revokeSession = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,    'shopId');
    const sessionId   = getParamAsString(req.params.sessionId, 'sessionId');
    const requesterId = req.user!.id;

    const result = await TerminalService.revokeSession({
      sessionId,
      requesterId,
      shopId,
    });
    res.json(result);
  });
}