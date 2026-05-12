"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useShop } from "@/context/ShopContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { formatDateTime, toISODate, getDefaultDateRange } from "@/utils/formatDate";
import toast from "react-hot-toast";
import { EmptyState } from "@/components/states";
import { SkeletonTable } from "@/components/ui/Skeleton";

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

  // Load staff dropdown once on mount (non-critical)
  useEffect(() => {
    if (!isManager) return;
    api.get<StaffOption[]>(`/api/shops/${shopId}/shifts/staff`)
      .then(({ data }) => setStaffList(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [shopId, isManager]);

  // ── Single combined load function ────────────────────────
  // Merges shifts + stats into one effect to prevent cascading
  // re-renders and triple-fire in React StrictMode.
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
      toast.error(getErrorMessage(err.response?.data?.message));
      setShifts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }

    // Stats load separately — failure is non-fatal
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

  // Reset page to 1 when filters change, then load
  useEffect(() => {
    setPage(1);
    loadData(1);
  }, [dateFrom, dateTo, modeFilter, userFilter, loadData]);

  // Reload when page changes (but not when filters change — that's handled above)
  // We track whether a page change is user-initiated vs filter-reset
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

      {/* ── Empty state hint ────────────────────────────────── */}
      {!loading && shifts.length === 0 && (
        <div className="bg-[#FAEEDA] border border-[#BA7517]/30 rounded-lg px-4 py-3 text-[13px] text-[#BA7517]">
          <span className="font-medium">No shifts recorded yet. </span>
          Shifts are created when staff log into POS or Kitchen mode using their PIN.
          Each PIN login starts a shift; logging out ends it.
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Shifts"    value={String(stats.total_shifts)}                      colour="navy" />
          <StatCard label="Total Time"      value={formatMinutes(stats.total_minutes_worked)}        colour="teal" />
          <StatCard label="Avg Shift"       value={formatMinutes(stats.average_shift_minutes)}       colour="purple" />
          <StatCard label="POS / Kitchen"   value={`${stats.pos_shifts} / ${stats.kitchen_shifts}`} colour="amber" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <input
            type="date" value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 px-2 text-[12px] border border-[#D3D1C7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
          />
          <span className="text-[12px] text-[#5F5E5A]">to</span>
          <input
            type="date" value={dateTo} min={dateFrom}
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

        <span className="text-[12px] text-[#5F5E5A] ml-auto">
          {total} session{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Shifts table */}
      {loading ? (
        <SkeletonTable rows={6} cols={isManager ? 7 : 6} />
      ) : shifts.length === 0 ? (
        <EmptyState
          title="No shifts found"
          description="No work sessions recorded in this period. Staff must log into POS or Kitchen mode with a PIN to generate shift records."
        />
      ) : (
        <>
          <div className="bg-white border border-[#D3D1C7] rounded-lg overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#F1EFE8] border-b border-[#D3D1C7] text-[#5F5E5A] text-[12px]">
                  <th className="text-left px-5 py-3 font-medium">Shop</th>
                  {isManager && (
                    <th className="text-left px-4 py-3 font-medium">Staff</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Mode</th>
                  <th className="text-left px-4 py-3 font-medium">Started</th>
                  <th className="text-left px-4 py-3 font-medium">Ended</th>
                  <th className="text-right px-4 py-3 font-medium">Duration</th>
                  <th className="text-left px-5 py-3 font-medium">Device</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr
                    key={shift.session_id}
                    className={`border-b border-[#F1EFE8] last:border-0 hover:bg-[#F1EFE8]/40 ${
                      shift.is_active ? "bg-[#E1F5EE]/20" : ""
                    }`}
                  >
                    <td className="px-5 py-3 text-[#0F2B4C] font-medium text-[12px]">
                      {shopName}
                    </td>

                    {isManager && (
                      <td className="px-4 py-3 font-medium text-[#0F2B4C]">
                        {shift.staff_name}
                      </td>
                    )}

                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${ROLE_COLOURS[shift.shop_role] ?? "bg-[#F1EFE8] text-[#5F5E5A]"}`}>
                        {shift.shop_role}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${MODE_COLOURS[shift.mode_type]}`}>
                        {shift.mode_type}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-[#5F5E5A] text-[12px]">
                      {formatDateTime(shift.login_at)}
                    </td>

                    <td className="px-4 py-3 text-[#5F5E5A] text-[12px]">
                      {shift.logout_at ? (
                        formatDateTime(shift.logout_at)
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#0D7A5F] font-medium text-[12px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0D7A5F] animate-pulse" />
                          Active now
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-medium text-[#0F2B4C]">
                      {shift.duration_formatted}
                    </td>

                    <td className="px-5 py-3 text-[12px] text-[#5F5E5A]">
                      {shift.device_name ?? "Unknown device"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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