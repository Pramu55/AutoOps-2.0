import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoOps — AI-native DevOps control plane",
  description: "Automated incident management, workflow orchestration, and service monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0f1117] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
