import { z } from 'zod';

// ── Kitchen Stations ───────────────────────────────────────

export const createStationSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  // Hex colour: #RRGGBB or #RGB — validated by regex
  color:       z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
    message: 'color must be a valid hex colour e.g. #FF5733',
  }).optional(),
  sort_order:  z.number().int().min(0).optional(),
});

export const updateStationSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color:       z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/).optional(),
  is_active:   z.boolean().optional(),
  sort_order:  z.number().int().min(0).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required' }
);

// ── Station ↔ Product Model mapping ───────────────────────

export const assignModelSchema = z.object({
  product_model_id: z.string().uuid(),
});

// ── Ticket management ──────────────────────────────────────

export const updateTicketStatusSchema = z.object({
  // Only these transitions are allowed via the API.
  // QUEUED → IN_PROGRESS (first bump) is handled by item update.
  ticket_status: z.enum(['DONE', 'CANCELLED']),
});

export const updateTicketPrioritySchema = z.object({
  priority: z.enum(['NORMAL', 'HIGH']),
});

// ── Item kitchen status ────────────────────────────────────

export const updateItemKitchenStatusSchema = z.object({
  // Kitchen staff move items forward through the lifecycle.
  // CANCELLED is set automatically when an order item is removed.
  kitchen_status: z.enum(['PREPARING', 'READY', 'SERVED']),
});

// ── Ticket list query params ───────────────────────────────

export const listTicketsQuerySchema = z.object({
  status:     z.string().optional(),    // comma-separated: QUEUED,IN_PROGRESS
  station_id: z.string().uuid().optional(),
  limit:      z.coerce.number().int().min(1).max(100).optional().default(50),
  offset:     z.coerce.number().int().min(0).optional().default(0),
});