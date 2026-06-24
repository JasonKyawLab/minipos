// Path: src/modules/kitchen/kitchen.controller.ts

import { Request, Response }   from 'express';
import { KitchenService }      from './kitchen.service.js';
import { getParamAsString }    from '../../utils/converter.js';
import { handleError }         from '../../utils/handleError.js';
import { KitchenTicketStatus } from './kitchen.types.js';

export class KitchenController {

  // =======================================================
  // STATIONS
  // =======================================================

  static async createStation(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.kitchenSession!.userId; 

      const station = await KitchenService.createStation({
        shopId, requesterId, input: req.body,
      });
      return res.status(201).json(station);
    } catch (err) { return handleError(res, err); }
  }

  static async getStations(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId, 'shopId');
      const requesterId = req.kitchenSession!.userId; 

      const stations = await KitchenService.getStations(shopId, requesterId);
      return res.json(stations);
    } catch (err) { return handleError(res, err); }
  }

  static async updateStation(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,    'shopId');
      const stationId   = getParamAsString(req.params.stationId, 'stationId');
      const requesterId = req.kitchenSession!.userId; 

      const updated = await KitchenService.updateStation({
        shopId, stationId, requesterId, input: req.body,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async deleteStation(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,    'shopId');
      const stationId   = getParamAsString(req.params.stationId, 'stationId');
      const requesterId = req.kitchenSession!.userId; 

      const result = await KitchenService.deleteStation({
        shopId, stationId, requesterId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  // =======================================================
  // STATION ↔ MODEL ASSIGNMENT
  // =======================================================

  static async assignModel(req: Request, res: Response) {
    try {
      const shopId         = getParamAsString(req.params.shopId,    'shopId');
      const stationId      = getParamAsString(req.params.stationId, 'stationId');
      const requesterId    = req.kitchenSession!.userId; 
      const { product_model_id } = req.body;

      const result = await KitchenService.assignModel({
        shopId, stationId, productModelId: product_model_id, requesterId,
      });
      return res.status(201).json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async unassignModel(req: Request, res: Response) {
    try {
      const shopId       = getParamAsString(req.params.shopId,    'shopId');
      const stationId    = getParamAsString(req.params.stationId, 'stationId');
      const modelId      = getParamAsString(req.params.modelId,   'modelId');
      const requesterId  = req.kitchenSession!.userId; 

      const result = await KitchenService.unassignModel({
        shopId, stationId, productModelId: modelId, requesterId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

  static async getAssignedModels(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,    'shopId');
      const stationId   = getParamAsString(req.params.stationId, 'stationId');
      const requesterId = req.kitchenSession!.userId; 

      const models = await KitchenService.getAssignedModels({
        shopId, stationId, requesterId,
      });
      return res.json(models);
    } catch (err) { return handleError(res, err); }
  }

  // =======================================================
  // TICKETS
  // =======================================================

  static async getTickets(req: Request, res: Response) {
    try {
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
      return res.json(tickets);
    } catch (err) { return handleError(res, err); }
  }

  static async getTicketById(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
      const requesterId = req.kitchenSession!.userId; 

      const ticket = await KitchenService.getTicketById(ticketId, shopId, requesterId);
      return res.json(ticket);
    } catch (err) { return handleError(res, err); }
  }

  static async updateTicketStatus(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
      const requesterId = req.kitchenSession!.userId;
      const { ticket_status } = req.body;

      const updated = await KitchenService.updateTicketStatus({
        ticketId, shopId, requesterId, status: ticket_status,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async updateTicketPriority(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
      const requesterId = req.kitchenSession!.userId; 
      const { priority } = req.body;

      const updated = await KitchenService.updateTicketPriority({
        ticketId, shopId, requesterId, priority,
      });
      return res.json(updated);
    } catch (err) { return handleError(res, err); }
  }

  static async updateItemStatus(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
      const itemId      = getParamAsString(req.params.itemId,   'itemId');
      const requesterId = req.kitchenSession!.userId; 
      const { kitchen_status } = req.body;

      const result = await KitchenService.updateItemKitchenStatus({
        ticketId, itemId, shopId, requesterId, newStatus: kitchen_status,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }

static async cancelTicket(req: Request, res: Response) {
    try {
      const shopId      = getParamAsString(req.params.shopId,   'shopId');
      const ticketId    = getParamAsString(req.params.ticketId, 'ticketId');
      const requesterId = req.kitchenSession!.userId;

      const result = await KitchenService.cancelTicketByStaff({
        shopId, ticketId, requesterId,
      });
      return res.json(result);
    } catch (err) { return handleError(res, err); }
  }
  
}