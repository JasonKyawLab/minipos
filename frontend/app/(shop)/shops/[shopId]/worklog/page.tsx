"use client";
// =========================================================
// app/(shop)/shops/[shopId]/worklog/page.tsx
//
// FIX: Two changes made here:
//
// 1. BETTER ERROR DIAGNOSTICS
//    The previous code called toast.error(getErrorMessage(...))
//    which maps the backend code to a friendly string. But
//    if the backend returns an unexpected error (e.g. a DB
//    crash, missing table, or 404 route mismatch), the string
//    "Something went wrong" tells you nothing.
//
//    The fix: we now capture err.response?.status (the raw
//    HTTP status code) alongside the message code, and show
//    a richer error: "[503] Something went wrong." This lets
//    you identify at a glance whether it's a:
//      403 → permissions problem (user not in shop_users)
//      404 → route not found (check backend mounting)
//      500 → server crash (check backend logs / DB)
//      503 → DB connection failed
//
//    If you're getting a 404 specifically on /shifts, the
//    most likely causes are:
//      a) The 'staff_mode_sessions' table doesn't exist yet.
//         Run your migration scripts. The table is defined
//         in 001_init_schema.sql.
//      b) The shift router isn't mounted. Check app.ts line:
//         app.use("/api/shops/:shopId/shifts", shiftRoutes);
//      c) Your user account is not in shop_users for this
//         shop. The owner must have a shop_users row with
//         role='OWNER'. This is created when the shop is
//         created via ShopService.create().
//
// 2. AUTO-REFRESH ON TAB VISIBILITY
//    Same visibilitychange pattern as the Orders page.
//    When you return to the Worklog tab after a POS session,
//    the list automatically refreshes to show the new shift.
//
// CHANGED: shifts table now uses the shared Table/TableHead/
// Th/TableBody/Tr/Td components — fixes the Device column and
// duration getting clipped (not scrollable) on narrower screens.
// =========================================================

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatDateTime, toISODate, getDefaultDateRange } from "@/utils/formatDate";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, TableHead, Th, TableBody, Tr, Td } from "@/components/ui/Table";

interface ShiftRecord {
  session_id:         string;
  user_id:            string;
  staff_name:         string;
  shop_role:          string;
  mode_type:          "POS" | "KITCHEN";
  login_at:           string;
  logout_at:          string | null;
  duration_minutes:   number | null;
  duration_formatted: string;
  is_active:          boolean;
  device_name:        string | null;
}

interface ShiftsResponse {
  shifts: ShiftRecord[];
  total:  number;
}

interface ShiftStats {
  total_shifts:          number;
  total_minutes_worked:  number;
  average_shift_minutes: number;
  pos_shifts:            number;
  kitchen_shifts:        number;
}

interface StaffOption {
  user_id: string;
  name:    string;
  role:    string;
}

const ROLE_COLOURS: Record<string, string> = {
  OWNER:   "bg-[#EEEDFE] text-[#534AB7]",
  MANAGER: "bg-[#FAEEDA] text-[#BA7517]",
  CASHIER: "bg-[#E1F5EE] text-[#0D7A5F]",
  CHEF:    "bg-[#0F2B4C]/10 text-[#0F2B4C]",
};

const MODE_COLOURS: Record<string, string> = {
  POS:     "bg-[#0F2B4C]/10 text-[#0F2B4C]",
  KITCHEN: "bg-[#0A0A0A]/10 text-[#5F5E5A]",
};

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildErrorToast(err: any): string {
  const status  = err.response?.status;
  const code    = err.response?.data?.message;
  const message = getErrorMessage(code);

  if (status) {
    return `[${status}] ${message}`;
  }
  return message;
}

export default function WorkLogPage() {
  const { shopId, shopName, userRole } = useShop();
  const isManager = ["OWNER", "MANAGER"].includes(userRole);

  const [shifts, setShifts]       = useState<ShiftRecord[]>([]);
  const [stats, setStats]         = useState<ShiftStats | null>(null);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const limit = 20;

  const { from: defFrom, to: defTo } = getDefaultDateRange();
  const [dateFrom, setDateFrom]     = useState(defFrom);
  const [dateTo, setDateTo]         = useState(defTo);
  const [modeFilter, setModeFilter] = useState<"" | "POS" | "KITCHEN">("");
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
    if (!isManager) return;
    api.get<StaffOption[]>(`/api/shops/${shopId}/shifts/staff`)
      .then(({ data }) => setStaffList(Array.isArray(data) ? data : []))
      .catch(() => {
        // Silently fail — the staff filter just won't appear.
      });
  }, [shopId, isManager]);

  const loadData = useCallback(async (currentPage: number) => {
    setLoading(true);

    const params: Record<string, string | number> = {
      from:   dateFrom,
      to:     dateTo,
      limit,
      offset: (currentPage - 1) * limit,
    };
    if (modeFilter) params.mode   = modeFilter;
    if (userFilter) params.userId = userFilter;

    try {
      const { data } = await api.get<ShiftsResponse>(
        `/api/shops/${shopId}/shifts`, { params }
      );
      setShifts(Array.isArray(data.shifts) ? data.shifts : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
    } catch (err: any) {
      toast.error(buildErrorToast(err));
      setShifts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }

    try {
      const statsParams: Record<string, string> = { from: dateFrom, to: dateTo };
      if (userFilter) statsParams.userId = userFilter;

      const { data } = await api.get<ShiftStats>(
        `/api/shops/${shopId}/shifts/stats`, { params: statsParams }
      );
      setStats(data);
    } catch {
      setStats(null);
    }
  }, [shopId, dateFrom, dateTo, modeFilter, userFilter]);

  useEffect(() => {
    setPage(1);
    loadData(1);
  }, [dateFrom, dateTo, modeFilter, userFilter, loadData]);

  const [isPageChange, setIsPageChange] = useState(false);

  useEffect(() => {
    if (!isPageChange) return;
    setIsPageChange(false);
    loadData(page);
  }, [page, isPageChange, loadData]);

  function goToPage(newPage: number) {
    setPage(newPage);
    setIsPageChange(true);
  }

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadData(page);
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadData, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="animate-fade-in space-y-5">

      <div>
        <h1 className="text-[22px] font-medium text-[#0F2B4C]">Work Log</h1>
        <p className="text-[13px] text-[#5F5E5A] mt-0.5">
          {isManager
            ? "Track all staff shifts across POS and Kitchen modes."
            : "Your shift history for POS and Kitchen sessions."
          }
        </p>
      </div>

      {!loading && shifts.length === 0 && (
        <div className="bg-[#FAEEDA] border border-[#BA7517]/30 rounded-lg px-4 py-3 text-[13px] text-[#BA7517]">
          <span className="font-medium">No shifts recorded yet. </span>
          Shifts are created when staff log into POS or Kitchen mode using their PIN.
          Each PIN login starts a shift; logging out ends it.
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Shifts"    value={String(stats.total_shifts)}                      colour="navy" />
          <StatCard label="Total Time"      value={formatMinutes(stats.total_minutes_worked)}        colour="teal" />
          <StatCard label="Avg Shift"       value={formatMinutes(stats.average_shift_minutes)}       colour="purple" />
          <StatCard label="POS / Kitchen"   value={`${stats.pos_shifts} / ${stats.kitchen_shifts}`} colour="amber" />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          />
          <span className="text-[12px] text-[#5F5E5A]">to</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 px-2 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          />
        </div>

        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as "" | "POS" | "KITCHEN")}
          className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none"
        >
          <option value="">All modes</option>
          <option value="POS">POS only</option>
          <option value="KITCHEN">Kitchen only</option>
        </select>

        {isManager && staffList.length > 0 && (
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none"
          >
            <option value="">All staff</option>
            {staffList.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => loadData(page)}
          disabled={loading}
          className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] disabled:opacity-40 transition"
          title="Refresh"
        >
          ↻ Refresh
        </button>

        <span className="text-[12px] text-[#5F5E5A] ml-auto">
          {total} session{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Shifts table ────────────────────────────────── */}
      {loading ? (
        <SkeletonTable rows={6} cols={isManager ? 7 : 6} />
      ) : shifts.length === 0 ? (
        <EmptyState
          title="No shifts found"
          description="No work sessions recorded in this period. Staff must log into POS or Kitchen mode with a PIN to generate shift records."
        />
      ) : (
        <>
          <Table className="min-w-[780px]">
            <TableHead>
              <Th>Shop</Th>
              {isManager && <Th>Staff</Th>}
              <Th>Role</Th>
              <Th>Mode</Th>
              <Th>Started</Th>
              <Th>Ended</Th>
              <Th align="right">Duration</Th>
              <Th>Device</Th>
            </TableHead>
            <TableBody>
              {shifts.map((shift) => (
                <Tr
                  key={shift.session_id}
                  className={shift.is_active ? "bg-[#E1F5EE]/20" : undefined}
                >
                  <Td className="text-[#0F2B4C] font-medium text-[12px]">
                    {shopName}
                  </Td>

                  {isManager && (
                    <Td className="font-medium text-[#0F2B4C]">
                      {shift.staff_name}
                    </Td>
                  )}

                  <Td>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                      ROLE_COLOURS[shift.shop_role] ?? "bg-[#F1EFE8] text-[#5F5E5A]"
                    }`}>
                      {shift.shop_role}
                    </span>
                  </Td>

                  <Td>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${MODE_COLOURS[shift.mode_type]}`}>
                      {shift.mode_type}
                    </span>
                  </Td>

                  <Td className="text-[#5F5E5A] text-[12px]">
                    {formatDateTime(shift.login_at)}
                  </Td>

                  <Td className="text-[#5F5E5A] text-[12px]">
                    {shift.logout_at ? (
                      formatDateTime(shift.logout_at)
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[#0D7A5F] font-medium text-[12px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0D7A5F] animate-pulse" />
                        Active now
                      </span>
                    )}
                  </Td>

                  <Td align="right" className="font-medium text-[#0F2B4C]">
                    {shift.duration_formatted}
                  </Td>

                  <Td className="text-[12px] text-[#5F5E5A]">
                    {shift.device_name ?? "Unknown device"}
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => goToPage(page - 1)}
                className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg disabled:opacity-40 hover:bg-[#F1EFE8]"
              >
                ← Prev
              </button>
              <span className="text-[12px] text-[#5F5E5A]">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => goToPage(page + 1)}
                className="h-8 px-3 text-[12px] border border-[#D3D1C7] rounded-lg disabled:opacity-40 hover:bg-[#F1EFE8]"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Colour = "navy" | "teal" | "purple" | "amber";

const STAT_STYLES: Record<Colour, { card: string; value: string }> = {
  navy:   { card: "bg-[#F1EFE8]", value: "text-[#0F2B4C]" },
  teal:   { card: "bg-[#E1F5EE]", value: "text-[#0D7A5F]" },
  purple: { card: "bg-[#EEEDFE]", value: "text-[#534AB7]" },
  amber:  { card: "bg-[#FAEEDA]", value: "text-[#BA7517]" },
};

function StatCard({ label, value, colour }: { label: string; value: string; colour: Colour }) {
  const s = STAT_STYLES[colour];
  return (
    <div className={`${s.card} rounded-lg p-4`}>
      <p className="text-[12px] text-[#5F5E5A] font-medium mb-1">{label}</p>
      <p className={`text-[22px] font-semibold leading-tight ${s.value}`}>{value}</p>
    </div>
  );
}