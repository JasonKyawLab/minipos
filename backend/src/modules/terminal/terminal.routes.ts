import { Router }             from 'express';
import { TerminalController } from './terminal.controller.js';
import { requireAuth }        from '../auth/auth.middleware.js';
import { requireRole }        from '../auth/role.middleware.js';
import { validate }           from '../../middlewares/validate.middleware.js';
import { z }                  from 'zod';

const router = Router({ mergeParams: true });

// ── Schemas ───────────────────────────────────────────────

const activateSchema = z.object({
  password:  z.string().min(1),
  mode:      z.enum(['POS', 'KITCHEN']),
  device_id: z.string().uuid().optional(),
});

const managerPinSchema = z.object({
  user_id:   z.string().uuid(),
  pin:       z.string().regex(/^\d{4,6}$/),
  mode:      z.enum(['POS', 'KITCHEN']),
  device_id: z.string().uuid().optional(),
});

const emergencyCodeSchema = z.object({
  code:      z.string().length(8),
  mode:      z.enum(['POS', 'KITCHEN']),
  user_id:   z.string().uuid().optional(),
  device_id: z.string().uuid().optional(),
});

// FIX: Exit only needs password. user_id is read from
// the terminal_session cookie server-side.
const exitSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// ── Public terminal endpoints ─────────────────────────────
// These are called FROM the terminal after access_token is gone.

router.post(
  '/activate/manager-pin',
  validate(managerPinSchema),
  TerminalController.activateViaManagerPin
);

router.post(
  '/activate/emergency',
  validate(emergencyCodeSchema),
  TerminalController.activateViaEmergencyCode
);

// EXIT — called from the terminal, terminal_session cookie present,
// no access_token. No requireAuth here.
router.post(
  '/exit',
  validate(exitSchema),
  TerminalController.exit
);

// ── Protected endpoints ───────────────────────────────────
// Require platform access_token (dashboard management).

router.use(requireAuth);
router.use(requireRole('USER'));

router.post(
  '/activate',
  validate(activateSchema),
  TerminalController.activate
);

router.post(
  '/emergency-code',
  validate(z.object({ mode: z.enum(['POS', 'KITCHEN']) })),
  TerminalController.generateEmergencyCode
);

router.get('/sessions', TerminalController.listSessions);
router.delete('/sessions/:sessionId', TerminalController.revokeSession);

export default router;