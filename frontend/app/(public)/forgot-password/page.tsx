"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <Image src="/logo-stacked.png" alt="MiniPOS" width={120} height={80} className="object-contain mx-auto mb-2" />
          <p className="text-[13px] text-[#5F5E5A]">Point of sale for small businesses</p>
        </div>

        <div className="bg-white rounded-lg border border-[#D3D1C7] shadow-sm p-6">
          {sent ? (
            <div className="text-center">
              <p className="text-[22px] mb-3">📧</p>
              <p className="text-[15px] font-semibold text-[#0F2B4C] mb-2">Check your email</p>
              <p className="text-[13px] text-[#5F5E5A]">
                If an account with <strong>{email}</strong> exists, we've sent a password reset link. Check your inbox.
              </p>
              <Link href="/login" className="inline-block mt-5 text-[13px] text-[#0D7A5F] hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-[17px] font-semibold text-[#0F2B4C] mb-1">Forgot password?</h1>
              <p className="text-[13px] text-[#5F5E5A] mb-5">Enter your email and we'll send you a reset link.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-[#FCEBEB] border border-[#A32D2D]/30">
                  <p className="text-[13px] text-[#A32D2D]">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="your@email.com"
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition disabled:opacity-50"
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link href="/login" className="text-[13px] text-[#5F5E5A] hover:text-[#0F2B4C]">
                  Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
