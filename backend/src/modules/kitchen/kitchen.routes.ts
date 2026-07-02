import { Router }            from 'express';
import { KitchenController } from './kitchen.controller.js';
import { requireKitchenAuth, requireKitchenRole } from '../kitchen-auth/kitchen-auth.middleware.js';
import { validate }          from '../../middlewares/validate.middleware.js';
import {
  createStationSchema, updateStationSchema, assignModelSchema,
  updateTicketStatusSchema, updateTicketPrioritySchema,
  updateItemKitchenStatusSchema,
} from './kitchen.schema.js';

const router = Router({ mergeParams: true });

// All kitchen routes require a valid kitchen_token cookie.
// CASHIER role cannot obtain this token — they are blocked at login.
router.use(requireKitchenAuth);
router.patch("/tickets/:ticketId/cancel", KitchenController.cancelTicket);
// STATIONS — OWNER/CHEF only
router.post('/stations',   validate(createStationSchema), requireKitchenRole('OWNER', 'CHEF'), KitchenController.createStation);
router.get('/stations',    KitchenController.getStations);
router.patch('/stations/:stationId', validate(updateStationSchema), requireKitchenRole('OWNER', 'CHEF'), KitchenController.updateStation);
router.delete('/stations/:stationId', requireKitchenRole('OWNER', 'CHEF'), KitchenController.deleteStation);

// STATION ↔ MODEL
router.post('/stations/:stationId/models',            validate(assignModelSchema), requireKitchenRole('OWNER', 'CHEF'), KitchenController.assignModel);
router.get('/stations/:stationId/models',             KitchenController.getAssignedModels);
router.delete('/stations/:stationId/models/:modelId', requireKitchenRole('OWNER', 'CHEF'), KitchenController.unassignModel);

// TICKETS — any kitchen staff can view and bump
router.get('/tickets',             KitchenController.getTickets);
router.get('/tickets/:ticketId',   KitchenController.getTicketById);
router.patch('/tickets/:ticketId/status',   validate(updateTicketStatusSchema),   KitchenController.updateTicketStatus);
router.patch('/tickets/:ticketId/priority', validate(updateTicketPrioritySchema), requireKitchenRole('OWNER', 'CHEF'), KitchenController.updateTicketPriority);
router.patch('/tickets/:ticketId/items/:itemId/status', validate(updateItemKitchenStatusSchema), KitchenController.updateItemStatus);

export default router;