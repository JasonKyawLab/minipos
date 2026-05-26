import { Router }             from 'express';
import { PosAuthController }  from './pos-auth.controller.js';
import { requireAuth }        from '../auth/auth.middleware.js';
import { requireRole }        from '../auth/role.middleware.js';
import { requireShopRole }    from './pos-auth.middleware.js';
import { validate }           from '../../middlewares/validate.middleware.js';
import { requireVerifiedDevice } from '../../middlewares/device.verification.middleware.js';
import {
  setPinSchema,
  pinLoginSchema,
  updatePinMaxAttemptsSchema,
} from './pos-auth.schema.js';

const router = Router({ mergeParams: true });

// ==========================================================
// PUBLIC ROUTES – no platform auth required
// ==========================================================

// FIX: Added requireVerifiedDevice so that unregistered/unapproved
// devices receive a 403 DEVICE_NOT_VERIFIED immediately on page load,
// triggering the auto-registration flow in the frontend before the
// user even attempts a PIN login.
router.get(
  '/staff-list',
  requireVerifiedDevice,
  PosAuthController.getStaffList,
);

router.post(
  '/login',
  validate(pinLoginSchema),
  requireVerifiedDevice,
  PosAuthController.login,
);

router.post('/logout', PosAuthController.logout);

// ==========================================================
// PROTECTED ROUTES – require platform access_token
// ==========================================================

router.use(requireAuth);
router.use(requireRole('USER'));

router.post('/pin',   validate(setPinSchema), PosAuthController.setPin);
router.delete('/pin', PosAuthController.removePin);

router.post(
  '/staff/:userId/pin',
  requireShopRole('OWNER', 'MANAGER'),
  validate(setPinSchema),
  PosAuthController.setStaffPin,
);

router.delete(
  '/staff/:userId/pin',
  requireShopRole('OWNER', 'MANAGER'),
  PosAuthController.removeStaffPin,
);

router.post(
  '/force-logout/:userId',
  requireShopRole('OWNER', 'MANAGER'),
  PosAuthController.forceLogout,
);

router.patch(
  '/reset-lock/:userId',
  requireShopRole('OWNER', 'MANAGER'),
  PosAuthController.resetStaffLock,
);

router.patch(
  '/settings',
  requireShopRole('OWNER', 'MANAGER'),
  validate(updatePinMaxAttemptsSchema),
  PosAuthController.updateSettings,
);

export default router;