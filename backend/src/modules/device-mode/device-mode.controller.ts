import { Request, Response }      from 'express';
import { DeviceModeService }      from './device-mode.service.js';
import { getParamAsString }       from '../../utils/converter.js';
import { handleError }            from '../../utils/handleError.js';

export class DeviceModeController {

  // GET /api/shops/:shopId/devices/:deviceId/mode
  static async getStatus(req: Request, res: Response) {
    try {
      const shopId   = getParamAsString(req.params.shopId,   'shopId');
      const deviceId = getParamAsString(req.params.deviceId, 'deviceId');

      const status = await DeviceModeService.getModeStatus(deviceId, shopId);
      return res.json(status);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/devices/:deviceId/mode/activate
  static async activate(req: Request, res: Response) {
    try {
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

      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  }

  // POST /api/shops/:shopId/devices/:deviceId/mode/exit
  static async exit(req: Request, res: Response) {
    try {
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

      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // GET /api/shops/:shopId/devices/:deviceId/mode/activity
  static async getActivity(req: Request, res: Response) {
    try {
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

      return res.json(activity);
    } catch (err) { return handleError(res, err); }
  }
}