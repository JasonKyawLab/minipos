import { Router }                from 'express';
import { DeviceModeController }  from './device-mode.controller.js';
import { requireAuth }           from '../auth/auth.middleware.js';
import { requireRole }           from '../auth/role.middleware.js';
import { validate }              from '../../middlewares/validate.middleware.js';
import { activateModeSchema, exitModeSchema } from './device-mode.schema.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole('USER'));

// GET  /api/shops/:shopId/devices/:deviceId/mode
router.get('/',          DeviceModeController.getStatus);

// POST /api/shops/:shopId/devices/:deviceId/mode/activate
router.post('/activate', validate(activateModeSchema), DeviceModeController.activate);

// POST /api/shops/:shopId/devices/:deviceId/mode/exit
router.post('/exit',     validate(exitModeSchema),     DeviceModeController.exit);

// GET  /api/shops/:shopId/devices/:deviceId/mode/activity
router.get('/activity',  DeviceModeController.getActivity);

export default router;