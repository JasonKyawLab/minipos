import { Request, Response } from 'express';
import { DeviceService }     from './device.service.js';
import { getParamAsString }  from '../../utils/converter.js';
import { asyncHandler }      from '../../utils/asyncHandler.js';
import { DeviceRepository } from './device.repository.js';

export class DeviceController {

  // POST /api/shops/:shopId/devices/register
  // Public — no platform auth required.
  static register = asyncHandler(async (req: Request, res: Response) => {
    const shopId     = getParamAsString(req.params.shopId, 'shopId');
    const { device_key, device_name } = req.body;

    const { device, isNew } = await DeviceService.registerDevice({
      shopId,
      deviceKey:  device_key,
      deviceName: device_name ?? null,
      userAgent:  req.headers['user-agent'] ?? null,
      ipAddress:  (req.ip ?? req.socket.remoteAddress ?? null),
    });

    res.status(isNew ? 201 : 200).json(device);
  });

  // GET /api/shops/:shopId/devices
  static list = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.user!.id;

    const devices = await DeviceService.getDevices(shopId, requesterId);
    res.json(devices);
  });

  // PATCH /api/shops/:shopId/devices/:deviceId/approve
  static approve = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;

    const device = await DeviceService.approveDevice({
      shopId, deviceId, requesterId,
    });
    res.json(device);
  });

  // PATCH /api/shops/:shopId/devices/:deviceId/revoke
  static revoke = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;

    const device = await DeviceService.revokeDevice({
      shopId, deviceId, requesterId,
    });
    res.json(device);
  });

  // PATCH /api/shops/:shopId/devices/:deviceId/rename
  static rename = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;
    const { device_name } = req.body;

    const device = await DeviceService.renameDevice({
      shopId, deviceId, requesterId, deviceName: device_name,
    });
    res.json(device);
  });

  // DELETE /api/shops/:shopId/devices/:deviceId
  static remove = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;

    const result = await DeviceService.deleteDevice({
      shopId, deviceId, requesterId,
    });
    res.json(result);
  });

  // GET /api/shops/:shopId/devices/status?device_key=<uuid>
  // No auth required — device_key is not secret.
  static getStatus = asyncHandler(async (req: Request, res: Response) => {
    const shopId    = getParamAsString(req.params.shopId, 'shopId');
    const deviceKey = req.query.device_key as string | undefined;

    if (!deviceKey) {
      return res.status(400).json({ message: 'device_key query param required' });
    }

    const device = await DeviceRepository.findByDeviceKey(deviceKey, shopId);

    if (!device) {
      return res.json({ status: 'NOT_FOUND' });
    }

    res.json({
      status:      device.status,
      deviceName:  device.device_name,
    });
  });

  // GET /api/shops/:shopId/devices/pending-count
  static getPendingCount = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.user!.id;

    const count = await DeviceService.getPendingCount(shopId, requesterId);
    res.json({ count });
  });
}