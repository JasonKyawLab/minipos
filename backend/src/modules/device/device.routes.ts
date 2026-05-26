import { Router }           from "express";
import { DeviceController } from "./device.controller.js";
import { requireAuth }      from "../auth/auth.middleware.js";
import { requireRole }      from "../auth/role.middleware.js";
import { validate }         from "../../middlewares/validate.middleware.js";
import {
  registerDeviceSchema,
  renameDeviceSchema,
} from "./device.schema.js";

const router = Router({ mergeParams: true });

// ==========================================================
// PUBLIC ROUTES – no authentication required
// ==========================================================

router.post(
  "/register",
  validate(registerDeviceSchema),
  DeviceController.register
);

// ==========================================================
// PROTECTED ROUTES – require platform authentication
// ==========================================================

router.use(requireAuth);
router.use(requireRole("USER"));

router.get("/", DeviceController.list);
router.get('/status', DeviceController.getStatus);
router.patch("/:deviceId/approve", DeviceController.approve);
router.patch("/:deviceId/revoke", DeviceController.revoke);
router.patch("/:deviceId/rename", validate(renameDeviceSchema), DeviceController.rename);
router.delete("/:deviceId", DeviceController.remove);

export default router;