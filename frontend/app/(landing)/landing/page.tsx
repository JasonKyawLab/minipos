import Link from "next/link";
import Image from "next/image";
import { ContactForm } from "@/components/landing/ContactForm";

export const metadata = {
  title: "MiniPOS — The POS system that grows with you",
  description:
    "Start small, think big. MiniPOS fits your shop today and scales as you expand. Built for restaurants, retail shops, and online stores.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F1EFE8] font-sans">

      {/* ── Nav ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-[#D3D1C7]">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Image src="/logo.png" alt="MiniPOS" width={120} height={40} className="object-contain" />
          <div className="flex items-center gap-2">
            <Link href="/login" className="px-4 py-1.5 text-[13px] font-medium text-[#0F2B4C] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition">
              Sign in
            </Link>
            <Link href="/login" className="px-4 py-1.5 text-[13px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="bg-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <span className="inline-block px-3 py-1 text-[12px] font-medium text-[#0D7A5F] bg-[#E1F5EE] rounded-full mb-5">
            Built for every business
          </span>
          <h1 className="text-[40px] font-semibold text-[#0F2B4C] leading-tight mb-4">
            The POS system that grows with you
          </h1>
          <p className="text-[16px] text-[#5F5E5A] mb-8 leading-relaxed">
            Start small, think big. MiniPOS fits your shop today and scales as you expand —
            from a single counter to a chain of stores.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/login" className="px-6 py-2.5 text-[14px] font-medium text-white bg-[#0D7A5F] rounded-lg hover:bg-[#0a6b52] transition">
              Get started free
            </Link>
            <a href="#how-it-works" className="px-6 py-2.5 text-[14px] font-medium text-[#0F2B4C] border border-[#D3D1C7] rounded-lg hover:bg-[#F1EFE8] transition">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#F1EFE8]">
        <div className="max-w-5xl mx-auto">
          <p className="text-[12px] font-semibold text-[#0D7A5F] uppercase tracking-wider mb-2">Features</p>
          <h2 className="text-[26px] font-semibold text-[#0F2B4C] mb-2">Everything you need to run your business</h2>
          <p className="text-[14px] text-[#5F5E5A] mb-10">From taking orders to closing shifts — MiniPOS covers it all.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "🖥️", color: "#E1F5EE", title: "POS terminal", desc: "Fast checkout with multiple payment methods and order tracking." },
              { icon: "🍳", color: "#E6F1FB", title: "Kitchen display", desc: "Real-time order tickets sent directly to kitchen staff." },
              { icon: "📱", color: "#FAEEDA", title: "QR ordering", desc: "Customers scan a table QR code to browse and order themselves." },
              { icon: "📊", color: "#EEEDFE", title: "Reports & shifts", desc: "Daily sales, shift summaries, and staff management tools." },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-[#D3D1C7] p-5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg mb-3" style={{ background: f.color }}>
                  {f.icon}
                </div>
                <h3 className="text-[14px] font-semibold text-[#0F2B4C] mb-1">{f.title}</h3>
                <p className="text-[13px] text-[#5F5E5A] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Screenshots placeholder ──────────────────────── */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-[12px] font-semibold text-[#0D7A5F] uppercase tracking-wider mb-2">See it in action</p>
          <h2 className="text-[26px] font-semibold text-[#0F2B4C] mb-2">Built for how your team works</h2>
          <p className="text-[14px] text-[#5F5E5A] mb-10">A clean, fast interface your staff can learn in minutes.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { label: "POS terminal", desc: "Take orders, apply discounts, and accept payments from one screen.", src: "/pos-screenshot.png" },
              { label: "Kitchen display", desc: "Kitchen staff see orders in real time — no paper tickets needed.", src: "/kitchen-screenshot.png" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[#D3D1C7] overflow-hidden">
                <div className="relative w-full aspect-video bg-[#F1EFE8]">
                  <Image src={s.src} alt={s.label} fill className="object-cover object-top" />
                </div>
                <div className="p-4">
                  <h3 className="text-[14px] font-semibold text-[#0F2B4C] mb-1">{s.label}</h3>
                  <p className="text-[13px] text-[#5F5E5A]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#F1EFE8]">
        <div className="max-w-5xl mx-auto">
          <p className="text-[12px] font-semibold text-[#0D7A5F] uppercase tracking-wider mb-2">Who it's for</p>
          <h2 className="text-[26px] font-semibold text-[#0F2B4C] mb-2">Made for businesses like yours</h2>
          <p className="text-[14px] text-[#5F5E5A] mb-10">Whatever you sell, MiniPOS fits your workflow — and scales as you grow.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: "🍜", title: "Restaurants", desc: "Table orders, kitchen display, QR menus" },
              { icon: "🛍️", title: "Retail shops", desc: "Fast checkout, inventory, staff shifts" },
              { icon: "📦", title: "Online shops", desc: "Order management, payments, reports" },
            ].map((a) => (
              <div key={a.title} className="bg-white rounded-xl border border-[#D3D1C7] p-6 text-center">
                <div className="text-3xl mb-3">{a.icon}</div>
                <h3 className="text-[14px] font-semibold text-[#0F2B4C] mb-1">{a.title}</h3>
                <p className="text-[13px] text-[#5F5E5A]">{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section id="how-it-works" className="py-16 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-[12px] font-semibold text-[#0D7A5F] uppercase tracking-wider mb-2">How it works</p>
          <h2 className="text-[26px] font-semibold text-[#0F2B4C] mb-2">Up and running in minutes</h2>
          <p className="text-[14px] text-[#5F5E5A] mb-10">No technical setup needed.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { n: "1", title: "Create account", desc: "Sign up free — no credit card needed." },
              { n: "2", title: "Set up your shop", desc: "Add your products, tables, and staff." },
              { n: "3", title: "Start selling", desc: "Take orders and track sales instantly." },
            ].map((s) => (
              <div key={s.n} className="flex gap-4 items-start">
                <div className="w-9 h-9 rounded-full bg-[#0D7A5F] text-white text-[14px] font-semibold flex items-center justify-center shrink-0">
                  {s.n}
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#0F2B4C] mb-1">{s.title}</h3>
                  <p className="text-[13px] text-[#5F5E5A]">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ─────────────────────────────────────── */}
      <section id="contact" className="py-16 px-6 bg-[#F1EFE8]">
        <div className="max-w-2xl mx-auto">
          <p className="text-[12px] font-semibold text-[#0D7A5F] uppercase tracking-wider mb-2">Contact</p>
          <h2 className="text-[26px] font-semibold text-[#0F2B4C] mb-2">Get in touch</h2>
          <p className="text-[14px] text-[#5F5E5A] mb-8">Have a question or want to learn more? We'd love to hear from you.</p>
          <ContactForm />
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="py-16 px-6 bg-[#0F2B4C]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-[28px] font-semibold text-white mb-3">Ready to get started?</h2>
          <p className="text-[15px] text-white/70 mb-8">
            Join businesses already using MiniPOS to sell smarter — from corner shops to growing chains.
          </p>
          <Link href="/login" className="inline-block px-8 py-3 text-[14px] font-medium text-[#0F2B4C] bg-white rounded-lg hover:bg-[#F1EFE8] transition">
            Create free account
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="bg-[#0F2B4C] border-t border-white/10 px-6 py-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <Image src="/logo-icon.png" alt="MiniPOS" width={28} height={28} className="object-contain opacity-70" />
          <p className="text-[12px] text-white/40">© 2026 MiniPOS · Built for small businesses</p>
          <a href="#contact" className="text-[12px] text-white/60 hover:text-white transition">Contact</a>
        </div>
      </footer>

    </div>
  );
}
