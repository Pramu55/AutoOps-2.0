import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@autoops/shared"],

  // Defensive rewrite: if any stale browser bundle still calls the old
  // /api/v1/auth/* path on the Next.js server, redirect it to the proxy
  // Route Handlers at /api/auth/*. This handles browser-cache race conditions
  // during Fast Refresh cycles.
  async rewrites() {
    return [
      {
        source: "/api/v1/auth/:path*",
        destination: "/api/auth/:path*",
      },
    ];
  },

  // In dev: disable aggressive caching so browsers always fetch fresh JS
  async headers() {
    if (process.env["NODE_ENV"] !== "development") return [];
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
