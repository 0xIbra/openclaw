import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { WsProvider } from "@/lib/ws";

export const metadata: Metadata = {
  title: "Blackbox Agents",
  description: "PTY-based agent supervision for Claude Code and Kimi-CLI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">
        <WsProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </WsProvider>
      </body>
    </html>
  );
}
