import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { AuthProvider }        from "@/context/AuthContext";
import { SessionGuardProvider } from "@/context/SessionGuardContext";
import { AppShell }            from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MiniPOS", template: "%s | MiniPOS" },
  description: "Modern point-of-sale system for small businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          Order matters:
          1. SessionGuardProvider — outermost, checks session type first
          2. AuthProvider        — only meaningful for PLATFORM sessions
          3. AppShell            — blocks render until session type known
          4. children            — actual page content
        */}
        <SessionGuardProvider>
          <AuthProvider>
            <AppShell>
              {children}
            </AppShell>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  fontSize: "13px",
                  fontFamily: "system-ui, sans-serif",
                  borderRadius: "8px",
                  border: "0.5px solid #D3D1C7",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  maxWidth: "360px",
                },
                success: {
                  style: { background: "#E1F5EE", color: "#0D7A5F", border: "0.5px solid #0D7A5F" },
                  iconTheme: { primary: "#0D7A5F", secondary: "#E1F5EE" },
                },
                error: {
                  duration: 5000,
                  style: { background: "#FCEBEB", color: "#A32D2D", border: "0.5px solid #A32D2D" },
                  iconTheme: { primary: "#A32D2D", secondary: "#FCEBEB" },
                },
              }}
            />
          </AuthProvider>
        </SessionGuardProvider>
      </body>
    </html>
  );
}