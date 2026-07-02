import { Sidebar } from "@/components/layout/Sidebar";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F1EFE8]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[1200px]">
          {children}
        </div>
      </main>
    </div>
  );
}