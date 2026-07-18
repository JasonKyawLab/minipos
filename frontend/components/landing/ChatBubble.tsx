"use client";

import { useState, useRef, useEffect } from "react";
import api from "@/lib/api";

interface Faq       { id: number; question: string; answer: string; }
interface Category  { name: string; faqs: Faq[]; }
interface Message   { role: "user" | "bot"; text: string; pending?: boolean; }

function renderInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function BotText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const bullet = line.match(/^[\-\*]\s+(.*)/);
    const numbered = line.match(/^(\d+)\.\s+(.*)/);
    const content = bullet ? bullet[1].trim() : numbered ? numbered[2].trim() : "";

    if (bullet && content) {
      nodes.push(
        <div key={i} className="flex gap-1.5 items-start">
          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#0D7A5F] shrink-0" />
          <span dangerouslySetInnerHTML={{ __html: renderInline(content) }} />
        </div>
      );
    } else if (numbered && content) {
      nodes.push(
        <div key={i} className="flex gap-1.5 items-start">
          <span className="shrink-0 font-medium text-[#0D7A5F]">{numbered[1]}.</span>
          <span dangerouslySetInnerHTML={{ __html: renderInline(content) }} />
        </div>
      );
    } else if (!line.trim()) {
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      nodes.push(<p key={i} dangerouslySetInnerHTML={{ __html: renderInline(line) }} />);
    }
  });

  return <div className="space-y-0.5">{nodes}</div>;
}

const SESSION_ID = typeof crypto !== "undefined"
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

export function ChatBubble() {
  const [open,           setOpen]           = useState(false);
  const [input,          setInput]          = useState("");
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [categories,     setCategories]     = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFaqPanel,   setShowFaqPanel]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ categories: Category[] }>("/api/chat/faqs")
      .then(({ data }) => setCategories(data.categories ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setInput("");
    setActiveCategory(null);
    setShowFaqPanel(false);
    setMessages(prev => [...prev, { role: "user", text }, { role: "bot", text: "", pending: true }]);
    setLoading(true);

    try {
      const { data } = await api.post<{ answer: string; answered: boolean }>(
        "/api/chat/ask",
        { message: text.trim(), session_id: SESSION_ID }
      );
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "bot",
          text: data.answered
            ? data.answer
            : `${data.answer}\n\nYour question has been forwarded to our team — we'll follow up by email.`,
        };
        return next;
      });
    } catch {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "bot", text: "Sorry, something went wrong. Please try again." };
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  const hasMessages    = messages.length > 0;
  const selectedCategory = categories.find(c => c.name === activeCategory);

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-[#D3D1C7] flex flex-col overflow-hidden"
          style={{ maxHeight: "620px" }}
        >
          {/* Header */}
          <div className="bg-[#0F2B4C] px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#0D7A5F]" />
              <span className="text-[13px] font-semibold text-white">MiniPOS Support</span>
            </div>
            <div className="flex items-center gap-3">
              {hasMessages && (
                <button
                  onClick={() => { setShowFaqPanel(p => !p); setActiveCategory(null); }}
                  className="text-white/70 hover:text-white text-[11px] font-medium border border-white/20 rounded-lg px-2 py-1 transition"
                >
                  {showFaqPanel ? "Back to chat" : "Browse FAQs"}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none">×</button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-[#F9F8F5]">

            {/* FAQ panel — shown when no messages OR user clicked "Browse FAQs" */}
            {(!hasMessages || showFaqPanel) && (
              <div className="p-4">
                {!hasMessages && (
                  <div className="text-center mb-4">
                    <p className="text-[22px] mb-1">👋</p>
                    <p className="text-[13px] font-semibold text-[#0F2B4C]">Hi there!</p>
                    <p className="text-[12px] text-[#5F5E5A] mt-0.5">Ask anything or browse common questions below.</p>
                  </div>
                )}

                {!activeCategory ? (
                  <div className="space-y-2">
                    {categories.map(cat => (
                      <button
                        key={cat.name}
                        onClick={() => setActiveCategory(cat.name)}
                        className="w-full text-left px-3 py-2.5 bg-white border border-[#D3D1C7] rounded-xl text-[13px] font-medium text-[#0F2B4C] hover:border-[#0D7A5F] hover:bg-[#E1F5EE] transition flex items-center justify-between"
                      >
                        {cat.name}
                        <span className="text-[#aaa] text-[11px]">{cat.faqs.length} questions ›</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveCategory(null)}
                      className="flex items-center gap-1 text-[12px] text-[#0D7A5F] mb-1 hover:underline"
                    >
                      ‹ Back
                    </button>
                    <p className="text-[12px] font-semibold text-[#5F5E5A] mb-2">{activeCategory}</p>
                    {selectedCategory?.faqs.map(faq => (
                      <button
                        key={faq.id}
                        onClick={() => sendMessage(faq.question)}
                        className="w-full text-left px-3 py-2.5 bg-white border border-[#D3D1C7] rounded-xl text-[13px] text-[#0F2B4C] hover:border-[#0D7A5F] hover:bg-[#E1F5EE] transition"
                      >
                        {faq.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {hasMessages && !showFaqPanel && (
              <div className="p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#0D7A5F] text-white rounded-br-sm whitespace-pre-wrap"
                        : "bg-white border border-[#E5E5E5] text-[#1A1A1A] rounded-bl-sm"
                    }`}>
                      {msg.pending ? (
                        <span className="flex gap-1 items-center py-0.5">
                          <span className="w-1.5 h-1.5 bg-[#aaa] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 bg-[#aaa] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 bg-[#aaa] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      ) : msg.role === "bot" ? <BotText text={msg.text} /> : msg.text}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="border-t border-[#E5E5E5] p-3 flex gap-2 bg-white shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 h-9 px-3 text-[13px] border border-[#D3D1C7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D7A5F] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-9 px-3 bg-[#0D7A5F] text-white rounded-lg text-[13px] font-medium hover:bg-[#0a6b52] transition disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 sm:right-6 z-50 bg-[#0D7A5F] text-white rounded-full shadow-lg hover:bg-[#0a6b52] transition flex items-center justify-center"
        style={{ width: 52, height: 52 }}
        aria-label="Open chat"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </>
  );
}
