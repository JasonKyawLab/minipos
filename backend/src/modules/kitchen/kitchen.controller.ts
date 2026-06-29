import { Request, Response }   from 'express';
import { KitchenService }      from './kitchen.service.js';
import { getParamAsString }    from '../../utils/converter.js';
import { asyncHandler }        from '../../utils/asyncHandler.js';
import { KitchenTicketStatus } from './kitchen.types.js';

export class KitchenController {

  // =======================================================
  // STATIONS
  // =======================================================

  static createStation = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.kitchenSession!.userId;

    const station = await KitchenService.createStation({
      shopId, requesterId, input: req.body,
    });
    res.status(201).json(station);
  });

  static getStations = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.kitchenSession!.userId;

    const stations = await KitchenService.getStations(shopId, requesterId);
    res.json(stations);
  });

  static updateStation = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,    'shopId');
    const stationId   = getParamAsString(req.params.stationId, 'stationId');
    const requesterId = req.kitchenSession!.userId;

    const updated = await KitchenService.updateStation({
      shopId, stationId, requesterId, input: req.body,
    });
    res.json(updated);
  });

  static deleteStation = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,    'shopId');
    const stationId   = getParamAsString(req.params.stationId, 'stationId');
    const requesterId = req.kitchenSession!.userId;

    const result = await KitchenService.deleteStation({
      shopId, stationId, requesterId,
    });
    res.json(result);
  });

  // =======================================================
  // STATION ↔ MODEL ASSIGNMENT
  // =======================================================

  static assignModel = asyncHandler(async (req: Request, res: Response) => {
    const shopId         = getParamAsString(req.params.shopId,    'shopId');
    const stationId      = getParamAsString(req.params.stationId, 'stationId');
    const requesterId    = req.kitchenSession!.userId;
    const { product_model_id } = req.body;

    const result = await KitchenService.assignModel({
      shopId, stationId, productModelId: product_model_id, requesterId,
    });
    res.status(201).json(result);
  });

  static unassignModel = asyncHandler(async (req: Request, res: Response) => {
    const shopId       = getParamAsString(req.params.shopId,    'shopId');
    const stationId    = getParamAsString(req.params.stationId, 'stationId');
    const modelId      = getParamAsString(req.params.modelId,   'modelId');
    const requesterId  = req.kitchenSession!.userId;

    const result = await KitchenService.unassignModel({
      shopId, stationId, productModelId: modelId, requesterId,
    });
    res.json(result);
  });

  static getAssignedModels = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,    'shopId');
    const stationId   = getParamAsString(req.params.stationId, 'stationId');
    const requesterId = req.kitchenSession!.userId;

    const models = await KitchenService.getAssignedModels({
      shopId, stationId, requesterId,
    });
    res.json(models);
  });

  // =======================================================
  // TICKETS
  // =======================================================

  static getTickets = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId, 'shopId');
    const requesterId = req.kitchenSession!.userId;

    let statusList: KitchenTicketStatus[] | undefined;
    if (req.query.status) {
      statusList = (req.query.status as string)
        .split(',')
        .map((s) => s.trim()) as KitchenTicketStatus[];
    }

    const limit     = req.query.limit     ? parseInt(req.query.limit     as string) : 50;
    const offset    = req.query.offset    ? parseInt(req.query.offset    as string) : 0;
    const stationId = req.query.station_id as string | undefined;

    const tickets = await KitchenService.getActiveTickets(
      shopId, requesterId, { statusList, stationId, limit, offset }
    );
    res.json(tickets);
  });

  static getTicketById = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
    const requesterId = req.kitchenSession!.userId;

    const ticket = await KitchenService.getTicketById(ticketId, shopId, requesterId);
    res.json(ticket);
  });

  static updateTicketStatus = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
    const requesterId = req.kitchenSession!.userId;
    const { ticket_status } = req.body;

    const updated = await KitchenService.updateTicketStatus({
      ticketId, shopId, requesterId, status: ticket_status,
    });
    res.json(updated);
  });

  static updateTicketPriority = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
    const requesterId = req.kitchenSession!.userId;
    const { priority } = req.body;

    const updated = await KitchenService.updateTicketPriority({
      ticketId, shopId, requesterId, priority,
    });
    res.json(updated);
  });

  static updateItemStatus = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
    const itemId      = getParamAsString(req.params.itemId,   'itemId');
    const requesterId = req.kitchenSession!.userId;
    const { kitchen_status } = req.body;

    const result = await KitchenService.updateItemKitchenStatus({
      ticketId, itemId, shopId, requesterId, newStatus: kitchen_status,
    });
    res.json(result);
  });

  static cancelTicket = asyncHandler(async (req: Request, res: Response) => {
    const shopId      = getParamAsString(req.params.shopId,   'shopId');
    const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
    const requesterId = req.kitchenSession!.userId;

    const result = await KitchenService.cancelTicketByStaff({
      shopId, ticketId, requesterId,
    });
    res.json(result);
  });
}