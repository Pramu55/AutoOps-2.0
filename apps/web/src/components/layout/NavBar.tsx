"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutRequest } from "@/lib/api";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/incidents", label: "Incidents" },
  { href: "/services", label: "Services" },
  { href: "/workflows", label: "Workflows" },
  { href: "/alerts", label: "Alerts" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logoutRequest();
    } catch {
      // ignore — cookie cleared server-side
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="bg-[#1a1d27] border-b border-[#2a2d3a] px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L4.09 12.26a1 1 0 0 0 .91 1.64L11 13l-2 9 8.91-10.26a1 1 0 0 0-.91-1.64L11 11l2-9z" />
            </svg>
          </div>
          <span className="font-semibold text-white text-lg">AutoOps</span>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
