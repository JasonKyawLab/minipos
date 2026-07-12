"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { getErrorMessage } from "@/utils/errorMessages";
import { Spinner } from "@/components/states";
import toast from "react-hot-toast";
import Image from "next/image";

type Tab = "LOGIN" | "REGISTER";

export default function LoginPage() {
  return <Suspense><LoginContent /></Suspense>;
}

function LoginContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { refresh, isLoading, isAuthenticated, user } = useAuth();

  const [tab, setTab] = useState<Tab>("LOGIN");

  const [loginEmail, setLoginEmail]             = useState("");
  const [loginPassword, setLoginPassword]       = useState("");
  const [loginLoading, setLoginLoading]         = useState(false);
  const [loginError, setLoginError]             = useState("");
  const [loginUnverified, setLoginUnverified]   = useState(false);
  const [resendLoading, setResendLoading]       = useState(false);
  const [resendSent, setResendSent]             = useState(false);

  const [regName, setRegName]               = useState("");
  const [regEmail, setRegEmail]             = useState("");
  const [regPassword, setRegPassword]       = useState("");
  const [regConfirm, setRegConfirm]         = useState("");
  const [regLoading, setRegLoading]         = useState(false);
  const [regError, setRegError]             = useState("");
  const [regSuccess, setRegSuccess]         = useState("");

  // ── Redirect if already authenticated ──────────────────
  // MUST be in useEffect — never call router.replace() during render.
  // Calling router during render breaks Next.js RSC payload fetching
  // and causes the infinite "Failed to fetch RSC payload" loop.
  useEffect(() => {
     if (!isLoading && isAuthenticated && user) {
      const explicitRedirect = searchParams.get("redirect");
      const defaultRedirect = user.role === "ADMIN" ? "/admin/dashboard" : "/dashboard";
      router.replace(explicitRedirect ?? defaultRedirect);
    }
  }, [isLoading, isAuthenticated, router, searchParams]);

   useEffect(() => {
   const notice = sessionStorage.getItem("login_notice");
   if (notice) {
     toast.error(notice);
     sessionStorage.removeItem("login_notice");
   }
 }, []);

  // Show spinner while:
  // 1. AuthContext is checking the existing cookie (isLoading)
  // 2. User is authenticated and redirect is about to happen
  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  async function handleResendVerification() {
    setResendLoading(true);
    try {
      await api.post("/api/auth/resend-verification", { email: loginEmail.trim().toLowerCase() });
      setResendSent(true);
    } finally {
      setResendLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(""); setLoginUnverified(false); setResendSent(false);

    if (!loginEmail.trim()) { setLoginError("Email is required."); return; }
    if (!loginPassword)     { setLoginError("Password is required."); return; }

    setLoginLoading(true);
    try {
      await api.post("/api/auth/login", {
        email:    loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      // Refresh populates AuthContext with full user data.
      // Once isAuthenticated becomes true, the useEffect
      // above will fire and redirect to /dashboard.
      await refresh();

    } catch (err: any) {
      const code = err.response?.data?.message;
      if (code === "EMAIL_NOT_VERIFIED") {
        setLoginUnverified(true);
      } else {
        setLoginError(getErrorMessage(code));
      }
      setLoginLoading(false);
    }
    // Note: don't set loginLoading(false) on success —
    // the spinner stays visible until the redirect completes.
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError(""); setRegSuccess("");

    if (!regName.trim())              { setRegError("Name is required."); return; }
    if (!regEmail.trim())             { setRegError("Email is required."); return; }
    if (regPassword.length < 6)       { setRegError("Password must be at least 6 characters."); return; }
    if (regPassword !== regConfirm)   { setRegError("Passwords do not match."); return; }

    setRegLoading(true);
    try {
      const { data } = await api.post<{ message: string; restored?: boolean }>(
        "/api/auth/register",
        {
          name:     regName.trim(),
          email:    regEmail.trim().toLowerCase(),
          password: regPassword,
        }
      );

      setRegSuccess(
        data.restored
          ? "Your account was restored. Please log in."
          : "Account created! Please check your email to verify your account."
      );
      setTab("LOGIN");
      setRegName(""); setRegEmail(""); setRegPassword(""); setRegConfirm("");
    } catch (err: any) {
      const code = err.response?.data?.message;
      setRegError(getErrorMessage(code));
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">

        <div className="text-center mb-8">
          <Image src="/logo-stacked.png" alt="MiniPOS" width={120} height={80} className="object-contain mx-auto mb-2" />
          <p className="text-[13px] text-[#5F5E5A]">Point of sale for small businesses</p>
        </div>

        <div className="bg-white rounded-lg border border-[#D3D1C7] shadow-sm overflow-hidden">
          <div className="flex border-b border-[#D3D1C7]">
            {(["LOGIN", "REGISTER"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setLoginError(""); setRegError(""); setRegSuccess("");
                }}
                className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
                  tab === t
                    ? "text-[#0D7A5F] border-b-2 border-[#0D7A5F] bg-white"
                    : "text-[#5F5E5A] hover:text-[#0F2B4C]"
                }`}
              >
                {t === "LOGIN" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          <div className="p-6">
            {regSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-[#E1F5EE] border border-[#0D7A5F]/30">
                <p className="text-[13px] text-[#0D7A5F]">{regSuccess}</p>
              </div>
            )}

            {tab === "LOGIN" && (
              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && (
                  <div className="p-3 rounded-lg bg-[#FCEBEB] border border-[#A32D2D]/30">
                    <p className="text-[13px] text-[#A32D2D]">{loginError}</p>
                  </div>
                )}
                {loginUnverified && (
                  <div className="p-3 rounded-lg bg-[#FAEEDA] border border-[#C87D2A]/30">
                    <p className="text-[13px] text-[#7A4A0A] mb-2">Please verify your email before signing in. Check your inbox.</p>
                    {resendSent ? (
                      <p className="text-[12px] text-[#0D7A5F]">Verification email resent!</p>
                    ) : (
                      <button type="button" onClick={handleResendVerification} disabled={resendLoading}
                        className="text-[12px] text-[#0D7A5F] underline disabled:opacity-50">
                        {resendLoading ? "Sending…" : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                    placeholder="your@email.com"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[13px] font-medium text-[#1A1A1A]">Password</label>
                    <Link href="/forgot-password" className="text-[12px] text-[#0D7A5F] hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full h-10 flex items-center justify-center gap-2 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-[#0a6b52] transition"
                >
                  {loginLoading && <Spinner size={16} />}
                  Sign in
                </button>
              </form>
            )}

            {tab === "REGISTER" && (
              <form onSubmit={handleRegister} className="space-y-4">
                {regError && (
                  <div className="p-3 rounded-lg bg-[#FCEBEB] border border-[#A32D2D]/30">
                    <p className="text-[13px] text-[#A32D2D]">{regError}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Full name</label>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                    placeholder="Your name"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Email</label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                    placeholder="your@email.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Password</label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                    placeholder="Min. 6 characters"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[13px] font-medium text-[#1A1A1A]">Confirm password</label>
                  <input
                    type="password"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] focus:ring-offset-1"
                    placeholder="Repeat your password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full h-10 flex items-center justify-center gap-2 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg disabled:opacity-50 hover:bg-[#0a6b52] transition"
                >
                  {regLoading && <Spinner size={16} />}
                  Create account
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[12px] text-[#5F5E5A] mt-4">
          MiniPOS · Built for small businesses
        </p>
      </div>
    </div>
  );
}