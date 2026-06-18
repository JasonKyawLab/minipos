// =========================================================
// kitchen.service.ts
// Path: backend/src/modules/kitchen/kitchen.service.ts
//
// Flow D change: createTicket() now accepts round + is_addon.
// is_addon=true triggers the ADD-ON badge on the KDS.
// =========================================================

import { ShopRepository }    from '../shop/shop.repository.js';
import { AuditService }      from '../audit/audit.service.js';
import { KitchenRepository } from './kitchen.repository.js';
import { OrderRepository }   from '../order/order.repository.js';
import {
  CreateKitchenStationInput, UpdateKitchenStationInput,
  KitchenStatus, KitchenTicketStatus, KitchenPriority,
} from './kitchen.types.js';
import { appError }                                              from '../../utils/appError.js';
import { emitToShop, emitToKitchenTerminals, emitToQrSession }  from '../socket/socket.js';
import { SOCKET_EVENTS }                                         from '../socket/socket.events.js';

const WRITE_ROLES = ['OWNER', 'MANAGER'] as const;
const ALL_ROLES   = ['OWNER', 'MANAGER', 'CASHIER'] as const;

const KITCHEN_STATUS_RANK: Record<KitchenStatus, number> = {
  PENDING: 0, PREPARING: 1, READY: 2, SERVED: 3, CANCELLED: 4,
};

async function assertShopMember(shopId: string, userId: string, allowed: readonly string[]) {
  const member = await ShopRepository.getUserShopMembership(shopId, userId);
  if (!member || !member.is_active || !allowed.includes(member.role)) {
    throw new appError('FORBIDDEN', 403);
  }
  return member;
}

export class KitchenService {

  // ── Stations ──────────────────────────────────────────────

  static async createStation(params: { shopId: string; requesterId: string; input: CreateKitchenStationInput }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    return KitchenRepository.createStation(params.shopId, params.input);
  }

  static async getStations(shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);
    return KitchenRepository.findAllStations(shopId);
  }

  static async updateStation(params: { shopId: string; stationId: string; requesterId: string; input: UpdateKitchenStationInput }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const updated = await KitchenRepository.updateStation(params.stationId, params.shopId, params.input);
    if (!updated) throw new appError('STATION_NOT_FOUND', 404);
    return updated;
  }

  static async deleteStation(params: { shopId: string; stationId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const deleted = await KitchenRepository.deleteStation(params.stationId, params.shopId);
    if (!deleted) throw new appError('STATION_NOT_FOUND', 404);
    return { success: true };
  }

  static async assignModel(params: { shopId: string; stationId: string; productModelId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    await KitchenRepository.assignModel(params.stationId, params.productModelId);
    return { success: true };
  }

  static async unassignModel(params: { shopId: string; stationId: string; productModelId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const removed = await KitchenRepository.unassignModel(params.stationId, params.productModelId);
    if (!removed) throw new appError('MAPPING_NOT_FOUND', 404);
    return { success: true };
  }

  static async getAssignedModels(params: { shopId: string; stationId: string; requesterId: string }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);
    return KitchenRepository.findAssignedModels(params.stationId);
  }

  // ── Tickets ───────────────────────────────────────────────

  // Flow D: accepts round + is_addon for per-round discrete tickets
 
  static async createTicket(params: {
    shopId:       string;
    orderId:      string;
    orderNo:      string;
    orderType:    string;
    tableNumber:  string | null;
    customerName: string | null;
    notes:        string | null;
    round:        number;
    is_addon:     boolean;
  }) {
    const ticket = await KitchenRepository.createTicket(params);
 
    // Stamp all unstamped ACTIVE order items with this ticket's id.
    // Items are inserted before the ticket is created (the ticket
    // is issued when the order is confirmed). Stamping here ensures
    // each item is scoped to exactly one kitchen round.
    // Only items with ticket_id IS NULL are stamped — previous-round
    // items already have their own ticket_id and are left untouched.
    if (ticket?.id) {
      try {
        await KitchenRepository.stampItemsWithTicket(params.orderId, ticket.id);
      } catch (stampErr) {
        console.error('Failed to stamp order items with ticket_id:', stampErr);
      }
    }
 
    const payload = {
      ticketId:     ticket?.id,
      orderId:      params.orderId,
      orderNo:      params.orderNo,
      orderType:    params.orderType,
      tableNumber:  params.tableNumber,
      customerName: params.customerName,
      round:        params.round,
      is_addon:     params.is_addon,
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
 

  static async cancelTicket(params: { shopId: string; orderId: string; orderNo: string }) {
    await KitchenRepository.cancelTicket(params.orderId, params.shopId);
    const payload = { orderId: params.orderId, orderNo: params.orderNo, ticket_status: 'CANCELLED', timestamp: new Date().toISOString() };
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) { console.error('Kitchen socket emit failed:', socketErr); }
  }

  static async getActiveTickets(shopId: string, requesterId: string, filter: { statusList?: KitchenTicketStatus[]; stationId?: string; limit: number; offset: number }) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);
    return KitchenRepository.getActiveTickets(shopId, filter);
  }

  static async getTicketById(ticketId: string, shopId: string, requesterId: string) {
    await assertShopMember(shopId, requesterId, ALL_ROLES);
    const ticket = await KitchenRepository.findTicketWithItems(ticketId, shopId);
    if (!ticket) throw new appError('TICKET_NOT_FOUND', 404);
    return ticket;
  }

  static async updateTicketStatus(params: { ticketId: string; shopId: string; requesterId: string; status: KitchenTicketStatus }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const updated = await KitchenRepository.updateTicketStatus(params.ticketId, params.shopId, params.status);
    if (!updated) throw new appError('TICKET_NOT_FOUND', 404);

    const payload = { ticketId: params.ticketId, orderNo: updated.order_no, ticket_status: params.status, timestamp: new Date().toISOString() };
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) { console.error('Kitchen socket emit failed:', socketErr); }

    // Notify QR customer when kitchen marks ticket DONE
    if (params.status === 'DONE' && updated.order_type === 'QR') {
      try {
        const order = await OrderRepository.findOrderById(updated.order_id, params.shopId);
        if (order) {
          emitToQrSession(updated.order_id, SOCKET_EVENTS.QR_ORDER_STATUS, {
            orderId: updated.order_id, orderNo: updated.order_no,
            newStatus: order.status, timestamp: new Date().toISOString(),
          });
        }
      } catch (e) { console.error('QR session notify failed after DONE:', e); }
    }

    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: `KITCHEN_TICKET_${params.status}`, entity: 'KITCHEN_TICKET', entityId: params.ticketId,
    });

    return updated;
  }

  static async updateTicketPriority(params: { ticketId: string; shopId: string; requesterId: string; priority: KitchenPriority }) {
    await assertShopMember(params.shopId, params.requesterId, WRITE_ROLES);
    const updated = await KitchenRepository.updateTicketPriority(params.ticketId, params.shopId, params.priority);
    if (!updated) throw new appError('TICKET_NOT_FOUND', 404);
    const payload = { ticketId: params.ticketId, orderNo: updated.order_no, priority: params.priority, timestamp: new Date().toISOString() };
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) { console.error('Kitchen socket emit failed:', socketErr); }
    return updated;
  }

  static async updateItemKitchenStatus(params: { ticketId: string; itemId: string; shopId: string; requesterId: string; newStatus: KitchenStatus }) {
    await assertShopMember(params.shopId, params.requesterId, ALL_ROLES);

    const ticket = await KitchenRepository.findTicketWithItems(params.ticketId, params.shopId);
    if (!ticket) throw new appError('TICKET_NOT_FOUND', 404);

    const currentItem = ticket.items.find(i => i.id === params.itemId);
    if (!currentItem) throw new appError('ORDER_ITEM_NOT_FOUND', 404);

    if (params.newStatus !== 'CANCELLED') {
      const currentRank = KITCHEN_STATUS_RANK[currentItem.kitchen_status as KitchenStatus] ?? 0;
      const newRank     = KITCHEN_STATUS_RANK[params.newStatus];
      if (newRank < currentRank) throw new appError('INVALID_STATUS_TRANSITION', 400);
    }

    const { item, ticket: updatedTicket } = await KitchenRepository.updateItemKitchenStatus({
      itemId: params.itemId, orderId: ticket.order_id, shopId: params.shopId, newStatus: params.newStatus,
    });

    const itemPayload = {
      ticketId: params.ticketId, itemId: params.itemId,
      kitchen_status: params.newStatus, ticket_status: updatedTicket.ticket_status,
      timestamp: new Date().toISOString(),
    };

    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_ITEM_STATUS, itemPayload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_ITEM_STATUS, itemPayload);
      if (updatedTicket.ticket_status === 'READY') {
        const readyPayload = { ticketId: params.ticketId, orderNo: updatedTicket.order_no, tableNumber: updatedTicket.table_number, timestamp: new Date().toISOString() };
        emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_READY, readyPayload);
        emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_READY, readyPayload);
      }
    } catch (socketErr) { console.error('Kitchen socket emit failed:', socketErr); }

    await AuditService.log({
      shopId: params.shopId, userId: params.requesterId,
      action: `KITCHEN_ITEM_${params.newStatus}`, entity: 'ORDER_ITEM', entityId: params.itemId,
      metadata: { ticketId: params.ticketId, newStatus: params.newStatus },
    });

    return { item, ticket: updatedTicket };
  }
}