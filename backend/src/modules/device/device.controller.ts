// =========================================================
// device.controller.ts
// Path: src/modules/device/device.controller.ts
// =========================================================

import { Request, Response } from 'express';
import { DeviceService }     from './device.service.js';
import { getParamAsString }  from '../../utils/converter.js';
import { handleError }       from '../../utils/handleError.js';
import { DeviceRepository } from './device.repository.js';

export class DeviceController {

  // POST /api/shops/:shopId/devices/register
  // Public — no platform auth required.
  // The tablet calls this on first boot. If the device_key
  // already exists, it just returns the existing record.
  static async register(req: Request, res: Response) {
    try {
      const shopId     = getParamAsString(req.params.shopId, 'shopId');
      const { device_key, device_name } = req.body;

      const {device, isNew} = await DeviceService.registerDevice({
        shopId,
        deviceKey:  device_key,
        deviceName: device_name ?? null,
        userAgent:  req.headers['user-agent'] ?? null,
        ipAddress:  (req.ip ?? req.socket.remoteAddress ?? null),
      });

      return res.status(isNew ? 201 : 200).json(device);
  } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/devices
  static async list(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.user!.id;

      const devices = await DeviceService.getDevices(shopId, requesterId);
      return res.json(devices);
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/devices/:deviceId/approve
  static async approve(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
      const requesterId = req.user!.id;

      const device = await DeviceService.approveDevice({
        shopId, deviceId, requesterId,
      });
      return res.json(device);
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/devices/:deviceId/revoke
  static async revoke(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
      const requesterId = req.user!.id;

      const device = await DeviceService.revokeDevice({
        shopId, deviceId, requesterId,
      });
      return res.json(device);
    } catch (err) { return handleError(res, err); }
  }

  // PATCH /api/shops/:shopId/devices/:deviceId/rename
  static async rename(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
      const requesterId = req.user!.id;
      const { device_name } = req.body;

      const device = await DeviceService.renameDevice({
        shopId, deviceId, requesterId, deviceName: device_name,
      });
      return res.json(device);
    } catch (err) { return handleError(res, err); }
  }

  // DELETE /api/shops/:shopId/devices/:deviceId
  static async remove(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
      const requesterId = req.user!.id;

      const result = await DeviceService.deleteDevice({
        shopId, deviceId, requesterId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/devices/status?device_key=<uuid>
//
// Returns the approval status for a specific device_key.
// Called by the frontend polling loop every 5 seconds.
// No auth required — device_key is not secret (it's in localStorage).
// The response is intentionally minimal to avoid leaking device metadata.

  static async getStatus(req: Request, res: Response) {
  try {
    const shopId    = getParamAsString(req.params.shopId, 'shopId');
    const deviceKey = req.query.device_key as string | undefined;

    if (!deviceKey) {
      return res.status(400).json({ message: 'device_key query param required' });
    }

    const device = await DeviceRepository.findByDeviceKey(deviceKey, shopId);

    if (!device) {
      // Device was deleted from the dashboard — tell the frontend to re-register
      return res.json({ status: 'NOT_FOUND' });
    }

    return res.json({
      status:      device.status,        // PENDING | APPROVED | REVOKED
      deviceName:  device.device_name,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /api/shops/:shopId/devices/pending-count
  static async getPendingCount(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.user!.id;

      const count = await DeviceService.getPendingCount(shopId, requesterId);
      return res.json({ count });
    } catch (err) { return handleError(res, err); }
  }

}