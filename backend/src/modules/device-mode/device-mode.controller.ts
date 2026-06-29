import { Request, Response }      from 'express';
import { DeviceModeService }      from './device-mode.service.js';
import { getParamAsString }       from '../../utils/converter.js';
import { asyncHandler }           from '../../utils/asyncHandler.js';

export class DeviceModeController {

  // GET /api/shops/:shopId/devices/:deviceId/mode
  static getStatus = asyncHandler(async (req: Request, res: Response) => {
    const shopId   = getParamAsString(req.params.shopId,   'shopId');
    const deviceId = getParamAsString(req.params.deviceId, 'deviceId');

    const status = await DeviceModeService.getModeStatus(deviceId, shopId);
    res.json(status);
  });

  // POST /api/shops/:shopId/devices/:deviceId/mode/activate
  static activate = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;
    const { password, mode } = req.body;

    const result = await DeviceModeService.activateMode({
      shopId,
      deviceId,
      requesterId,
      password,
      mode,
    });

    res.status(201).json(result);
  });

  // POST /api/shops/:shopId/devices/:deviceId/mode/exit
  static exit = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;
    const { password, forced } = req.body;

    const result = await DeviceModeService.exitMode({
      shopId,
      deviceId,
      requesterId,
      password,
      forced: forced ?? false,
    });

    res.json(result);
  });

  // GET /api/shops/:shopId/devices/:deviceId/mode/activity
  static getActivity = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const deviceId    = getParamAsString(req.params.deviceId, 'deviceId');
    const requesterId = req.user!.id;
    const limit  = req.query.limit  ? parseInt(req.query.limit  as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const activity = await DeviceModeService.getStaffActivity({
      shopId,
      deviceId,
      requesterId,
      limit,
      offset,
    });

    res.json(activity);
  });
}