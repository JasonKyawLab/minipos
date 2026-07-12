"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordContent /></Suspense>;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!token)               { setError("Invalid reset link."); return; }

    setLoading(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err: any) {
      const code = err.response?.data?.message;
      setError(getErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-white rounded-lg border border-[#D3D1C7] shadow-sm p-6 text-center">
          <p className="text-[15px] font-semibold text-[#A32D2D] mb-2">Invalid reset link</p>
          <Link href="/forgot-password" className="text-[13px] text-[#0D7A5F] hover:underline">Request a new one</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <Image src="/logo-stacked.png" alt="MiniPOS" width={120} height={80} className="object-contain mx-auto mb-2" />
          <p className="text-[13px] text-[#5F5E5A]">Point of sale for small businesses</p>
        </div>

        <div className="bg-white rounded-lg border border-[#D3D1C7] shadow-sm p-6">
          {done ? (
            <div className="text-center">
              <p className="text-[22px] mb-3">✅</p>
              <p className="text-[15px] font-semibold text-[#0F2B4C] mb-2">Password updated!</p>
              <p className="text-[13px] text-[#5F5E5A] mb-5">You can now sign in with your new password.</p>
              <Link
                href="/login"
                className="inline-block px-6 py-2 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-[17px] font-semibold text-[#0F2B4C] mb-1">Set new password</h1>
              <p className="text-[13px] text-[#5F5E5A] mb-5">Choose a strong password for your account.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-[#FCEBEB] border border-[#A32D2D]/30">
                  <p className="text-[13px] text-[#A32D2D]">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    placeholder="Min. 6 characters"
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Repeat your password"
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition disabled:opacity-50"
                >
                  {loading ? "Saving…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
