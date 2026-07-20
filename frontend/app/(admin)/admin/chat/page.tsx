"use client";

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface PendingItem {
  id: number;
  question: string;
  customer: string;
  channel?: string;
  created_at?: string;
}

interface Stats {
  total: number;
  answered: number;
  unanswered: number;
}

export default function AdminChatPage() {
  const [pending, setPending]   = useState<PendingItem[]>([]);
  const [stats,   setStats]     = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [replyId, setReplyId]   = useState<number | null>(null);
  const [reply,   setReply]     = useState("");
  const [sending, setSending]   = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.get<{ pending: PendingItem[] }>("/api/chat/admin/pending"),
        api.get<Stats>("/api/chat/admin/stats"),
      ]);
      setPending(p.data.pending ?? []);
      setStats(s.data);
    } catch {
      toast.error("Failed to load chat inbox");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (replyId !== null) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [replyId]);

  async function handleReply(id: number) {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post("/api/chat/admin/reply", { id, message: reply.trim() });
      toast.success("Reply sent");
      setReplyId(null);
      setReply("");
      load();
    } catch {
      toast.error("Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function handleDismiss(id: number) {
    try {
      await api.post("/api/chat/admin/dismiss", { id });
      toast.success("Dismissed");
      load();
    } catch {
      toast.error("Failed to dismiss");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#0F2B4C]">Chat Inbox</h1>
          <p className="text-[13px] text-[#5F5E5A] mt-0.5">Unanswered questions from the website chat.</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-[13px] border border-[#D3D1C7] rounded-lg hover:bg-white transition text-[#0F2B4C]"
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total questions", value: stats.total },
            { label: "Answered",        value: stats.answered,   color: "text-[#0D7A5F]" },
            { label: "Unanswered",      value: stats.unanswered, color: stats.unanswered > 0 ? "text-amber-600" : undefined },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#D3D1C7] rounded-lg px-5 py-4">
              <p className="text-[12px] text-[#5F5E5A] mb-1">{s.label}</p>
              <p className={`text-[28px] font-semibold ${s.color ?? "text-[#0F2B4C]"}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pending list */}
      {loading ? (
        <div className="text-[13px] text-[#5F5E5A]">Loading…</div>
      ) : pending.length === 0 ? (
        <div className="bg-white border border-[#D3D1C7] rounded-xl p-8 text-center text-[13px] text-[#5F5E5A]">
          No pending questions 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(item => (
            <div key={item.id} className="bg-white border border-[#D3D1C7] rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0F2B4C] mb-0.5">{item.question}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {item.customer && (
                      <p className="text-[12px] text-[#5F5E5A]">From: {item.customer}</p>
                    )}
                    {item.channel && (
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[#F1EFE8] text-[#5F5E5A] capitalize">
                        {item.channel}
                      </span>
                    )}
                    {item.created_at && (
                      <span className="text-[11px] text-[#9CA3AF]">
                        {new Date(item.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { setReplyId(item.id); setReply(""); }}
                    className="px-3 py-1.5 text-[12px] font-medium bg-[#0D7A5F] text-white rounded-lg hover:bg-[#0a6b52] transition"
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => handleDismiss(item.id)}
                    className="px-3 py-1.5 text-[12px] font-medium border border-[#D3D1C7] text-[#5F5E5A] rounded-lg hover:bg-[#F1EFE8] transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {replyId === item.id && (
                <div className="mt-3 pt-3 border-t border-[#E5E5E5]">
                  <textarea
                    ref={textareaRef}
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    rows={3}
                    placeholder="Type your reply…"
                    className="w-full px-3 py-2 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] resize-none"
                  />
                  <div className="flex gap-2 mt-2 justify-end">
                    <button
                      onClick={() => { setReplyId(null); setReply(""); }}
                      className="px-3 py-1.5 text-[12px] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReply(item.id)}
                      disabled={sending || !reply.trim()}
                      className="px-3 py-1.5 text-[12px] font-medium bg-[#0D7A5F] text-white rounded-lg hover:bg-[#0a6b52] transition disabled:opacity-40"
                    >
                      {sending ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
