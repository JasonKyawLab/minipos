// =========================================================
// All routes nested under /api/shops/:shopId/kitchen
// mergeParams: true makes :shopId available in req.params
//
// Auth strategy:
//   All kitchen routes require a valid platform access_token
//   AND shop membership. Role enforcement is inside
//   KitchenService — OWNER/MANAGER for config, all roles
//   for the live kitchen display and item bumping.
//
// This lets the kitchen display be used by any shop member
// (including CASHIER) without needing a special "kitchen role".
// =========================================================

import { Router }            from 'express';
import { KitchenController } from './kitchen.controller.js';
import { requireAuth }       from '../auth/auth.middleware.js';
import { requireRole }       from '../auth/role.middleware.js';
import { validate }          from '../../middlewares/validate.middleware.js';
import {
  createStationSchema,
  updateStationSchema,
  assignModelSchema,
  updateTicketStatusSchema,
  updateTicketPrioritySchema,
  updateItemKitchenStatusSchema,
} from './kitchen.schema.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(requireRole('ADMIN', 'USER'));

// ==========================================================
// KITCHEN STATIONS
// ==========================================================

// POST   /api/shops/:shopId/kitchen/stations
router.post(
  '/stations',
  validate(createStationSchema),
  KitchenController.createStation
);

// GET    /api/shops/:shopId/kitchen/stations
router.get('/stations', KitchenController.getStations);

// PATCH  /api/shops/:shopId/kitchen/stations/:stationId
router.patch(
  '/stations/:stationId',
  validate(updateStationSchema),
  KitchenController.updateStation
);

// DELETE /api/shops/:shopId/kitchen/stations/:stationId
router.delete('/stations/:stationId', KitchenController.deleteStation);

// ==========================================================
// STATION ↔ PRODUCT MODEL ASSIGNMENT
// ==========================================================

// POST   /api/shops/:shopId/kitchen/stations/:stationId/models
router.post(
  '/stations/:stationId/models',
  validate(assignModelSchema),
  KitchenController.assignModel
);

// GET    /api/shops/:shopId/kitchen/stations/:stationId/models
router.get(
  '/stations/:stationId/models',
  KitchenController.getAssignedModels
);

// DELETE /api/shops/:shopId/kitchen/stations/:stationId/models/:modelId
router.delete(
  '/stations/:stationId/models/:modelId',
  KitchenController.unassignModel
);

// ==========================================================
// KITCHEN TICKETS
// ==========================================================

// GET    /api/shops/:shopId/kitchen/tickets
// Query: ?status=QUEUED,IN_PROGRESS&station_id=uuid&limit=50&offset=0
router.get('/tickets', KitchenController.getTickets);

// GET    /api/shops/:shopId/kitchen/tickets/:ticketId
router.get('/tickets/:ticketId', KitchenController.getTicketById);

// PATCH  /api/shops/:shopId/kitchen/tickets/:ticketId/status
router.patch(
  '/tickets/:ticketId/status',
  validate(updateTicketStatusSchema),
  KitchenController.updateTicketStatus
);

// PATCH  /api/shops/:shopId/kitchen/tickets/:ticketId/priority
router.patch(
  '/tickets/:ticketId/priority',
  validate(updateTicketPrioritySchema),
  KitchenController.updateTicketPriority
);

// PATCH  /api/shops/:shopId/kitchen/tickets/:ticketId/items/:itemId/status
// The core cook workflow endpoint — bump a single item forward
router.patch(
  '/tickets/:ticketId/items/:itemId/status',
  validate(updateItemKitchenStatusSchema),
  KitchenController.updateItemStatus
);

export default router;