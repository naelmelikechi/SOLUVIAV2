import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Reduce function invocations - cache dynamic pages for 60s
  experimental: {
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
  // Disable image optimization if not using next/image heavily (saves bandwidth)
  images: {
    unoptimized: false,
  },
};

export default nextConfig;
