"use client";

import { useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";

export default function VerifyEmailPage() {
  return <Suspense><VerifyEmailContent /></Suspense>;
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) { setStatus("error"); return; }

    api.get(`/api/auth/verify-email?token=${token}`)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <Image src="/logo-stacked.png" alt="MiniPOS" width={120} height={80} className="object-contain mx-auto mb-2" />
        </div>

        <div className="bg-white rounded-lg border border-[#D3D1C7] shadow-sm p-6 text-center">
          {status === "loading" && (
            <>
              <p className="text-[22px] mb-3">⏳</p>
              <p className="text-[15px] font-semibold text-[#0F2B4C]">Verifying your email…</p>
            </>
          )}

          {status === "success" && (
            <>
              <p className="text-[22px] mb-3">✅</p>
              <p className="text-[15px] font-semibold text-[#0F2B4C] mb-2">Email verified!</p>
              <p className="text-[13px] text-[#5F5E5A] mb-5">Your account is ready. You can now sign in.</p>
              <Link
                href="/login"
                className="inline-block px-6 py-2 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition"
              >
                Sign in
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <p className="text-[22px] mb-3">❌</p>
              <p className="text-[15px] font-semibold text-[#A32D2D] mb-2">Invalid or expired link</p>
              <p className="text-[13px] text-[#5F5E5A] mb-5">This verification link has expired or already been used.</p>
              <Link
                href="/login"
                className="text-[13px] text-[#0D7A5F] hover:underline"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
