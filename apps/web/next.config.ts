import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@multi-stream-alerts/shared',
    '@multi-stream-alerts/database',
    '@multi-stream-alerts/ui',
  ],
};

export default nextConfig;
