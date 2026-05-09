import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoOps - Operations Automation Platform",
  description:
    "Automated incident management, workflow orchestration, and service monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-gray-50">
          <nav className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">AO</span>
                </div>
                <span className="font-semibold text-gray-900 text-lg">AutoOps</span>
              </div>
              <nav className="flex items-center gap-6">
                <a
                  href="/"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Dashboard
                </a>
                <a
                  href="/incidents"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Incidents
                </a>
                <a
                  href="/services"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Services
                </a>
                <a
                  href="/workflows"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Workflows
                </a>
                <a
                  href="/alerts"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Alerts
                </a>
              </nav>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
