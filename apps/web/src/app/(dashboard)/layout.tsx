import type { Metadata } from "next";
import { NavBar } from "@/components/layout/NavBar";
import { ToastProvider } from "@/context/ToastContext";

export const metadata: Metadata = { title: "AutoOps" };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
