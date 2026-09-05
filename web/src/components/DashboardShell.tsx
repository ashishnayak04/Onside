"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";

interface DashboardShellProps {
  role: "super_admin" | "user";
  userName: string;
  children: React.ReactNode;
}

export default function DashboardShell({ role, userName, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--pitch)" }}>
      <Sidebar
        role={role}
        userName={userName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header
          className="lg:hidden flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-30"
          style={{
            background: "#0D3320",
            borderColor: "rgba(255,255,255,0.07)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.7)" }}
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span
            className="text-lg text-white tracking-wider"
            style={{ fontFamily: "var(--font-headline)", letterSpacing: "0.1em" }}
          >
            ONSIDE
          </span>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
