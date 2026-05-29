import type { NextConfig } from 'next';

const rawInternalApiUrl =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

const internalApiUrl = rawInternalApiUrl.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;