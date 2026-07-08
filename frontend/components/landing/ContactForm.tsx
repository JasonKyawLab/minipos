"use client";

import { useState } from "react";

export function ContactForm() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");

    const res = await fetch("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });

    setSending(false);

    if (res.ok) {
      setSent(true);
      setName(""); setEmail(""); setMessage("");
    } else {
      setError("Failed to send. Please try again or email us directly.");
    }
  }

  if (sent) {
    return (
      <div className="bg-[#E1F5EE] border border-[#0D7A5F] rounded-xl p-6 text-center">
        <p className="text-[22px] mb-2">✅</p>
        <p className="text-[15px] font-semibold text-[#0D7A5F]">Message sent!</p>
        <p className="text-[13px] text-[#5F5E5A] mt-1">We'll get back to you soon.</p>
        <button onClick={() => setSent(false)} className="mt-4 text-[13px] text-[#0D7A5F] underline">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#D3D1C7] p-6 space-y-4">
      <div>
        <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
        />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="w-full h-9 px-3 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F]"
        />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-[#1A1A1A] mb-1">Message</label>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          required
          className="w-full px-3 py-2 text-[14px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] resize-none"
        />
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="w-full h-10 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send message"}
      </button>
      <p className="text-center text-[12px] text-[#5F5E5A]">
        Or email us directly at{" "}
        <a href="mailto:minipos.site@gmail.com" className="text-[#0D7A5F] hover:underline">
          minipos.site@gmail.com
        </a>
      </p>
    </form>
  );
}
