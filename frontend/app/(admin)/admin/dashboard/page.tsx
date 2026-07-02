"use client";

import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import toast from "react-hot-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

interface AdminStats {
  totals: {
    total_users: number;
    suspended_users: number;
    admin_count: number;
    total_shops: number;
    suspended_shops: number;
  };
  signupsByDay: { date: string; count: number }[];
  shopBreakdown: { active: number; suspended: number; deleted: number };
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white border border-[#D3D1C7] rounded-lg px-5 py-4">
      <p className="text-[12px] text-[#5F5E5A] mb-1">{label}</p>
      <p className={`text-[28px] font-semibold ${accent ?? "text-[#0F2B4C]"}`}>{value}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<AdminStats>("/api/admin/stats");
        if (!cancelled) setStats(data);
      } catch (err: any) {
        toast.error(getErrorMessage(err.response?.data?.message));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-4">
        <h1 className="text-[22px] font-medium text-[#0F2B4C] mb-2">Dashboard</h1>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#F1EFE8] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const { totals, signupsByDay, shopBreakdown } = stats;

  // Format dates for the X axis as "MMM D" instead of full ISO strings.
  const chartData = signupsByDay.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  const breakdownData = [
    { name: "Active",    value: shopBreakdown.active,    color: "#0D7A5F" },
    { name: "Suspended", value: shopBreakdown.suspended, color: "#8A5A00" },
    { name: "Deleted",   value: shopBreakdown.deleted,   color: "#A32D2D" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-[22px] font-medium text-[#0F2B4C]">Dashboard</h1>

      {/* ── Headline numbers ──────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total users"      value={totals.total_users} />
        <StatCard label="Suspended users"  value={totals.suspended_users} accent={totals.suspended_users > 0 ? "text-[#A32D2D]" : undefined} />
        <StatCard label="Admins"           value={totals.admin_count} />
        <StatCard label="Total shops"      value={totals.total_shops} />
        <StatCard label="Suspended shops"  value={totals.suspended_shops} accent={totals.suspended_shops > 0 ? "text-[#8A5A00]" : undefined} />
      </div>

      {/* ── Signups over time ─────────────────────────── */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
        <p className="text-[13px] font-medium text-[#0F2B4C] mb-3">Signups — last 30 days</p>
        <div className="h-[220px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#5F5E5A" }} interval={3} />
              <YAxis tick={{ fontSize: 11, fill: "#5F5E5A" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #D3D1C7" }}
                labelStyle={{ color: "#0F2B4C", fontWeight: 500 }}
              />
              <Line type="monotone" dataKey="count" name="Signups" stroke="#0D7A5F" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Shop status breakdown ─────────────────────── */}
      <div className="bg-white border border-[#D3D1C7] rounded-lg p-5">
        <p className="text-[13px] font-medium text-[#0F2B4C] mb-3">Shop status breakdown</p>
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={breakdownData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#5F5E5A" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#0F2B4C" }} width={80} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #D3D1C7" }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {breakdownData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}