// =========================================================
// kitchen.service.ts
// Path: backend/src/modules/kitchen/kitchen.service.ts
//
// FIX: Added emitToKitchenTerminals() alongside every
// emitToShop() call.
//
// WHY this was needed:
//   The backend was emitting all kitchen events to room
//   shop:<shopId> — which is the PLATFORM room. Only users
//   with a valid access_token and joined via join_shop event
//   receive events there.
//
//   Kitchen display terminals authenticate via terminal_session
//   cookie, which auto-joins room terminal:<shopId>:KITCHEN
//   on socket connect. They are NEVER in shop:<shopId>.
//
//   Result: kitchen:ticket_created fired but the kitchen
//   display was in the wrong room — nothing arrived, chef
//   had to refresh to see new orders.
//
//   Fix: emit to BOTH rooms on every kitchen event:
//     - emitToShop()             → platform dashboard (owner sees it)
//     - emitToKitchenTerminals() → kitchen display (chef sees it)
// =========================================================

import { ShopRepository }    from '../shop/shop.repository.js';
import { AuditService }      from '../audit/audit.service.js';
import { KitchenRepository } from './kitchen.repository.js';
import {
  CreateKitchenStationInput,
  UpdateKitchenStationInput,
  KitchenStatus,
  KitchenTicketStatus,
  KitchenPriority,
} from './kitchen.types.js';
import { appError }                               from '../../utils/appError.js';
import { emitToShop, emitToKitchenTerminals }     from '../socket/socket.js';
import { SOCKET_EVENTS }                          from '../socket/socket.events.js';

// ── Role constants ─────────────────────────────────────────
const WRITE_ROLES = ['OWNER', 'MANAGER'] as const;
const ALL_ROLES   = ['OWNER', 'MANAGER', 'CASHIER'] as const;

// Status rank — prevents backwards transitions on item bumps
const KITCHEN_STATUS_RANK: Record<KitchenStatus, number> = {
  PENDING:   0,
  PREPARING: 1,
  READY:     2,
  SERVED:    3,
  CANCELLED: 4,
};

async function assertShopMember(
  shopId:  string,
  userId:  string,
  allowed: readonly string[]
) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }
  return member;
}

export class KitchenService {

  // =======================================================
  // KITCHEN STATIONS
  // =======================================================

  static async createStation(params: {
    shopId:      string;
    requesterId: string;
    input:       CreateKitchenStationInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const station = await KitchenRepository.createStation(
      params.shopId,
      params.input
    );

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'KITCHEN_STATION_CREATED',
      entity:   'KITCHEN_STATION',
      entityId: station.id,
      metadata: { name: station.name },
    });

    return station;
  }

  static async getStations(shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);
    return KitchenRepository.findAllStations(shopId);
  }

  static async updateStation(params: {
    shopId:      string;
    stationId:   string;
    requesterId: string;
    input:       UpdateKitchenStationInput;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const updated = await KitchenRepository.updateStation(
      params.stationId,
      params.shopId,
      params.input
    );
    if (!updated) throw new appError('STATION_NOT_FOUND', 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'KITCHEN_STATION_UPDATED',
      entity:   'KITCHEN_STATION',
      entityId: params.stationId,
    });

    return updated;
  }

  static async deleteStation(params: {
    shopId:      string;
    stationId:   string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const deleted = await KitchenRepository.deleteStation(
      params.stationId,
      params.shopId
    );
    if (!deleted) throw new appError('STATION_NOT_FOUND', 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'KITCHEN_STATION_DELETED',
      entity:   'KITCHEN_STATION',
      entityId: params.stationId,
    });

    return { success: true };
  }

  // =======================================================
  // STATION ↔ PRODUCT MODEL ASSIGNMENTS
  // =======================================================

  static async assignModel(params: {
    shopId:         string;
    stationId:      string;
    productModelId: string;
    requesterId:    string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const station = await KitchenRepository.findStationById(
      params.stationId,
      params.shopId
    );
    if (!station) throw new appError('STATION_NOT_FOUND', 404);

    await KitchenRepository.assignModel(params.stationId, params.productModelId);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'KITCHEN_STATION_MODEL_ASSIGNED',
      entity:   'KITCHEN_STATION',
      entityId: params.stationId,
      metadata: { product_model_id: params.productModelId },
    });

    return { success: true };
  }

  static async unassignModel(params: {
    shopId:         string;
    stationId:      string;
    productModelId: string;
    requesterId:    string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const removed = await KitchenRepository.unassignModel(
      params.stationId,
      params.productModelId
    );
    if (!removed) throw new appError('ASSIGNMENT_NOT_FOUND', 404);

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   'KITCHEN_STATION_MODEL_UNASSIGNED',
      entity:   'KITCHEN_STATION',
      entityId: params.stationId,
    });

    return { success: true };
  }

  static async getAssignedModels(params: {
    shopId:      string;
    stationId:   string;
    requesterId: string;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const station = await KitchenRepository.findStationById(
      params.stationId,
      params.shopId
    );
    if (!station) throw new appError('STATION_NOT_FOUND', 404);

    return KitchenRepository.findAssignedModels(params.stationId);
  }

  // =======================================================
  // KITCHEN TICKETS — Lifecycle
  // =======================================================

  static async createTicket(params: {
    shopId:       string;
    orderId:      string;
    orderNo:      string;
    orderType:    string;
    tableNumber:  string | null;
    customerName: string | null;
    notes:        string | null;
  }) {
    const ticket = await KitchenRepository.createTicket(params);

    // Emit to BOTH rooms:
    //   shop:<shopId>              → platform dashboard (owner/manager overview)
    //   terminal:<shopId>:KITCHEN  → kitchen display (chef sees new ticket)
    const payload = {
      ticketId:     ticket?.id,
      orderId:      params.orderId,
      orderNo:      params.orderNo,
      orderType:    params.orderType,
      tableNumber:  params.tableNumber,
      customerName: params.customerName,
      timestamp:    new Date().toISOString(),
    };

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_CREATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_CREATED, payload);
    } catch (socketErr) {
      console.error('Kitchen socket emit failed:', socketErr);
    }

    return ticket;
  }

  static async cancelTicket(params: {
    shopId:  string;
    orderId: string;
    orderNo: string;
  }) {
    await KitchenRepository.cancelTicket(params.orderId, params.shopId);

    const payload = {
      orderId:       params.orderId,
      orderNo:       params.orderNo,
      ticket_status: 'CANCELLED',
      timestamp:     new Date().toISOString(),
    };

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) {
      console.error('Kitchen socket emit failed:', socketErr);
    }
  }

  static async getActiveTickets(
    shopId:      string,
    requesterId: string,
    filter: {
      statusList?: KitchenTicketStatus[];
      stationId?:  string;
      limit:       number;
      offset:      number;
    }
  ) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);
    return KitchenRepository.getActiveTickets(shopId, filter);
  }

  static async getTicketById(
    ticketId:    string,
    shopId:      string,
    requesterId: string
  ) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);

    const ticket = await KitchenRepository.findTicketWithItems(ticketId, shopId);
    if (!ticket) throw new appError('TICKET_NOT_FOUND', 404);

    return ticket;
  }

  static async updateTicketStatus(params: {
    ticketId:    string;
    shopId:      string;
    requesterId: string;
    status:      KitchenTicketStatus;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const updated = await KitchenRepository.updateTicketStatus(
      params.ticketId,
      params.shopId,
      params.status
    );
    if (!updated) throw new appError('TICKET_NOT_FOUND', 404);

    const payload = {
      ticketId:      params.ticketId,
      orderNo:       updated.order_no,
      ticket_status: params.status,
      timestamp:     new Date().toISOString(),
    };

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) {
      console.error('Kitchen socket emit failed:', socketErr);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   `KITCHEN_TICKET_${params.status}`,
      entity:   'KITCHEN_TICKET',
      entityId: params.ticketId,
    });

    return updated;
  }

  static async updateTicketPriority(params: {
    ticketId:    string;
    shopId:      string;
    requesterId: string;
    priority:    KitchenPriority;
  }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);

    const updated = await KitchenRepository.updateTicketPriority(
      params.ticketId,
      params.shopId,
      params.priority
    );
    if (!updated) throw new appError('TICKET_NOT_FOUND', 404);

    const payload = {
      ticketId:  params.ticketId,
      orderNo:   updated.order_no,
      priority:  params.priority,
      timestamp: new Date().toISOString(),
    };

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) {
      console.error('Kitchen socket emit failed:', socketErr);
    }

    return updated;
  }

  // =======================================================
  // ITEM KITCHEN STATUS — The Cook Workflow
  // =======================================================

  static async updateItemKitchenStatus(params: {
    ticketId:    string;
    itemId:      string;
    shopId:      string;
    requesterId: string;
    newStatus:   KitchenStatus;
  }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    // 1. Resolve ticket and find current item
    const ticket = await KitchenRepository.findTicketWithItems(
      params.ticketId,
      params.shopId
    );
    if (!ticket) throw new appError('TICKET_NOT_FOUND', 404);

    const currentItem = ticket.items.find((i) => i.id === params.itemId);
    if (!currentItem) throw new appError('ORDER_ITEM_NOT_FOUND', 404);

    // 2. Validate forward-only transition (except CANCELLED)
    if (params.newStatus !== 'CANCELLED') {
      const currentRank = KITCHEN_STATUS_RANK[currentItem.kitchen_status as KitchenStatus] ?? 0;
      const newRank     = KITCHEN_STATUS_RANK[params.newStatus];
      if (newRank < currentRank) {
        throw new appError('INVALID_STATUS_TRANSITION', 400);
      }
    }

    // 3. Perform update + ticket status recalculation (atomic in repository)
    const { item, ticket: updatedTicket } =
      await KitchenRepository.updateItemKitchenStatus({
        itemId:    params.itemId,
        orderId:   ticket.order_id,
        shopId:    params.shopId,
        newStatus: params.newStatus,
      });

    // 4. Real-time notifications — emit to BOTH rooms
    const itemPayload = {
      ticketId:       params.ticketId,
      itemId:         params.itemId,
      kitchen_status: params.newStatus,
      ticket_status:  updatedTicket.ticket_status,
      timestamp:      new Date().toISOString(),
    };

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_ITEM_STATUS, itemPayload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_ITEM_STATUS, itemPayload);

      // If all items are READY, also fire the ticket_ready event
      if (updatedTicket.ticket_status === 'READY') {
        const readyPayload = {
          ticketId:    params.ticketId,
          orderNo:     updatedTicket.order_no,
          tableNumber: updatedTicket.table_number,
          timestamp:   new Date().toISOString(),
        };
        emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_READY, readyPayload);
        emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_READY, readyPayload);
      }
    } catch (socketErr) {
      console.error('Kitchen socket emit failed:', socketErr);
    }

    // 5. Audit Logging
    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   `KITCHEN_ITEM_${params.newStatus}`,
      entity:   'ORDER_ITEM',
      entityId: params.itemId,
      metadata: { ticketId: params.ticketId, newStatus: params.newStatus },
    });

    return { item, ticket: updatedTicket };
  }
}