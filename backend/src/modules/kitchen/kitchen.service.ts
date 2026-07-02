import { AuditService }      from '../audit/audit.service.js';
import { KitchenRepository } from './kitchen.repository.js';
import { OrderRepository }   from '../order/order.repository.js';
import { ShopRepository }    from '../shop/shop.repository.js';
import {
  CreateKitchenStationInput, UpdateKitchenStationInput,
  KitchenStatus, KitchenTicketStatus, KitchenPriority,
} from './kitchen.types.js';
import { appError }                                              from '../../utils/appError.js';
import { assertShopRole }                                        from '../../utils/authorize.js';
import { WRITE_ROLES, KITCHEN_ROLES }                             from '../../constants/roles.constants.js';
import { emitToShop, emitToKitchenTerminals, emitToPosTerminals, emitToQrSession }  from '../socket/socket.js';
import { SOCKET_EVENTS }                                         from '../socket/socket.events.js';

const KITCHEN_STATUS_RANK: Record<KitchenStatus, number> = {
  PENDING: 0, PREPARING: 1, READY: 2, SERVED: 3, CANCELLED: 4,
};

export class KitchenService {

  // ── Stations ──────────────────────────────────────────────

  static async createStation(params: { shopId: string; requesterId: string; input: CreateKitchenStationInput }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);
    return KitchenRepository.createStation(params.shopId, params.input);
  }

  static async getStations(shopId: string, requesterId: string) {
    await assertShopRole(shopId, requesterId, KITCHEN_ROLES);
    return KitchenRepository.findAllStations(shopId);
  }

  static async updateStation(params: { shopId: string; stationId: string; requesterId: string; input: UpdateKitchenStationInput }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);
    const updated = await KitchenRepository.updateStation(params.stationId, params.shopId, params.input);
    if (!updated) throw new appError('STATION_NOT_FOUND', 404);
    return updated;
  }

  static async deleteStation(params: { shopId: string; stationId: string; requesterId: string }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);
    const deleted = await KitchenRepository.deleteStation(params.stationId, params.shopId);
    if (!deleted) throw new appError('STATION_NOT_FOUND', 404);
    return { success: true };
  }

  static async assignModel(params: { shopId: string; stationId: string; productModelId: string; requesterId: string }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);
    await KitchenRepository.assignModel(params.stationId, params.productModelId);
    return { success: true };
  }

  static async unassignModel(params: { shopId: string; stationId: string; productModelId: string; requesterId: string }) {
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);
    const removed = await KitchenRepository.unassignModel(params.stationId, params.productModelId);
    if (!removed) throw new appError('MAPPING_NOT_FOUND', 404);
    return { success: true };
  }

  static async getAssignedModels(params: { shopId: string; stationId: string; requesterId: string }) {
    await assertShopRole(params.shopId, params.requesterId, KITCHEN_ROLES);
    return KitchenRepository.findAssignedModels(params.stationId);
  }

  // ── Tickets ───────────────────────────────────────────────

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

  static async cancelTicketByStaff(params: {
    shopId:      string;
    ticketId:    string;
    requesterId: string;
  }) {
    // Permission check — only OWNER/MANAGER can void a kitchen ticket.
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);

    const ticket = await KitchenRepository.findTicketById(params.ticketId, params.shopId);
    if (!ticket) throw new appError("TICKET_NOT_FOUND", 404);
    if (ticket.ticket_status === "CANCELLED") {
      throw new appError("TICKET_ALREADY_CANCELLED", 400);
    }

    await KitchenRepository.cancelTicket(ticket.order_id, params.shopId);

    // Also cancel the associated order so it no longer shows as OPEN/CONFIRMED
    const orderCancelled = await KitchenRepository.cancelOrderIfCancellable(
      ticket.order_id,
      params.shopId
    );

    // If the order couldn't be fully cancelled (food was already served),
    // void the cancelled items and recalculate the order total so POS shows
    // the correct remaining amount.
    if (!orderCancelled) {
      await KitchenRepository.voidItemsWithCancelledKitchenStatus(ticket.order_id);
      const shopInfo = await ShopRepository.findOperationalInfo(params.shopId);
      await OrderRepository.recalculateOrderTotals(ticket.order_id, shopInfo?.taxRate ?? 0);
    }

    await AuditService.log({
      shopId:   params.shopId,
      userId:   params.requesterId,
      action:   "KITCHEN_TICKET_VOIDED",
      entity:   "KITCHEN_TICKET",
      entityId: params.ticketId,
      metadata: { orderId: ticket.order_id, orderNo: ticket.order_no, orderCancelled },
    });

    const now = new Date().toISOString();

    const kitchenPayload = {
      orderId:       ticket.order_id,
      orderNo:       ticket.order_no,
      ticket_status: "CANCELLED",
      timestamp:     now,
    };
    emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, kitchenPayload);
    emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, kitchenPayload);

    // Notify POS terminals so they can clear the order from their active view
    emitToPosTerminals(params.shopId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
      orderId:   ticket.order_id,
      orderNo:   ticket.order_no,
      newStatus: orderCancelled ? "CANCELLED" : "PARTIAL_CANCEL",
      oldStatus: "CONFIRMED",
      source:    "KITCHEN",
      timestamp: now,
    });

    return { success: true };
  }

  static async getActiveTickets(shopId: string, requesterId: string, filter: { statusList?: KitchenTicketStatus[]; stationId?: string; limit: number; offset: number }) {
    await assertShopRole(shopId, requesterId, KITCHEN_ROLES);
    return KitchenRepository.getActiveTickets(shopId, filter);
  }

  static async getTicketById(ticketId: string, shopId: string, requesterId: string) {
    await assertShopRole(shopId, requesterId, KITCHEN_ROLES);
    const ticket = await KitchenRepository.findTicketWithItems(ticketId, shopId);
    if (!ticket) throw new appError('TICKET_NOT_FOUND', 404);
    return ticket;
  }

  static async updateTicketStatus(params: { ticketId: string; shopId: string; requesterId: string; status: KitchenTicketStatus }) {
    await assertShopRole(params.shopId, params.requesterId, KITCHEN_ROLES);

    const updated = await KitchenRepository.updateTicketStatus(params.ticketId, params.shopId, params.status);
    if (!updated) throw new appError('TICKET_NOT_FOUND', 404);

    const payload = { ticketId: params.ticketId, orderNo: updated.order_no, ticket_status: params.status, timestamp: new Date().toISOString() };
    try {
      emitToShop(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
      emitToKitchenTerminals(params.shopId, SOCKET_EVENTS.KITCHEN_TICKET_UPDATED, payload);
    } catch (socketErr) { console.error('Kitchen socket emit failed:', socketErr); }

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
    await assertShopRole(params.shopId, params.requesterId, WRITE_ROLES);
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
    await assertShopRole(params.shopId, params.requesterId, KITCHEN_ROLES);

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