// =========================================================
// pagination.ts
// Path: backend/src/utils/pagination.ts
//
// PURPOSE
//   One shared shape for "Google-style page 1, 2, 3" pagination,
//   reused by every list endpoint (orders, staff, products, admin
//   users/shops, etc.) instead of each module inventing its own
//   page/limit/offset handling.
//
//   We use offset/limit (not cursor-based) everywhere here because
//   none of MiniPOS's lists are large enough yet to need keyset
//   pagination — admin tables and per-shop order history are in
//   the hundreds/low-thousands of rows, not millions. If a table
//   like `orders` ever gets big enough for OFFSET to matter, this
//   util is the one place we'd swap the strategy.
// =========================================================

import { Request } from "express";

export interface PaginationParams {
  page:     number; // 1-indexed, what the UI shows
  pageSize: number;
  limit:    number; // SQL LIMIT  (= pageSize)
  offset:   number; // SQL OFFSET (= (page - 1) * pageSize)
}

export interface PaginationMeta {
  page:       number;
  pageSize:   number;
  totalCount: number;
  totalPages: number;
  hasNext:    boolean;
  hasPrev:    boolean;
}

export interface PaginatedResult<T> {
  data:       T[];
  pagination: PaginationMeta;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100; // hard ceiling — never let a client ask for 100,000 rows

/**
 * Reads `?page=` and `?pageSize=` from the query string, with safe
 * defaults and clamping. Use this in every controller that lists data.
 */
export function parsePaginationParams(req: Request): PaginationParams {
  let page     = parseInt(String(req.query.page ?? "1"), 10);
  let pageSize = parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

  return {
    page,
    pageSize,
    limit:  pageSize,
    offset: (page - 1) * pageSize,
  };
}

/**
 * Builds the response envelope `{ data, pagination }` once you have
 * the page of rows and the total row count (from a COUNT(*) OVER()
 * window column, or a separate COUNT query).
 */
export function buildPaginatedResult<T>(
  rows: T[],
  totalCount: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / params.pageSize);

  return {
    data: rows,
    pagination: {
      page:       params.page,
      pageSize:   params.pageSize,
      totalCount,
      totalPages,
      hasNext:    params.page < totalPages,
      hasPrev:    params.page > 1,
    },
  };
}