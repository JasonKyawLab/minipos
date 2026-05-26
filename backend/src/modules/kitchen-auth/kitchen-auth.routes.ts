import { Router }                from 'express';
import { KitchenAuthController } from './kitchen-auth.controller.js';
import { requireAuth }           from '../auth/auth.middleware.js';
import { requireRole }           from '../auth/role.middleware.js';
import { requireShopRole }       from '../pos-auth/pos-auth.middleware.js';
import { validate }              from '../../middlewares/validate.middleware.js';
import { requireVerifiedDevice } from '../../middlewares/device.verification.middleware.js';
import {
  kitchenSetPinSchema,
  kitchenLoginSchema,
  exitKitchenSchema,
} from './kitchen-auth.schema.js';

const router = Router({ mergeParams: true });

// ==========================================================
// PUBLIC ROUTES – no platform auth required
// ==========================================================

// FIX: Same as POS — device must be verified before the staff list
// is served, so the frontend can trigger auto-registration on page
// load rather than waiting for a PIN attempt to reveal the error.
router.get(
  '/staff-list',
  requireVerifiedDevice,
  KitchenAuthController.getStaffList,
);

router.post(
  '/login',
  validate(kitchenLoginSchema),
  requireVerifiedDevice,
  KitchenAuthController.login,
);

router.post('/logout', KitchenAuthController.logout);

// ==========================================================
// PROTECTED ROUTES – require platform access_token
// ==========================================================

router.use(requireAuth);
router.use(requireRole('USER'));

router.post('/pin',   validate(kitchenSetPinSchema), KitchenAuthController.setPin);
router.delete('/pin', KitchenAuthController.removePin);

router.post(
  '/staff/:userId/pin',
  requireShopRole('OWNER', 'MANAGER'),
  validate(kitchenSetPinSchema),
  KitchenAuthController.setStaffKitchenPin,
);

router.delete(
  '/staff/:userId/pin',
  requireShopRole('OWNER', 'MANAGER'),
  KitchenAuthController.removeStaffKitchenPin,
);

router.patch(
  '/reset-lock/:userId',
  requireShopRole('OWNER', 'MANAGER'),
  KitchenAuthController.resetStaffLock,
);

router.post(
  '/force-logout/:userId',
  requireShopRole('OWNER', 'MANAGER'),
  KitchenAuthController.forceLogout,
);

router.post(
  '/exit',
  validate(exitKitchenSchema),
  KitchenAuthController.exitKitchenMode,
);

export default router;