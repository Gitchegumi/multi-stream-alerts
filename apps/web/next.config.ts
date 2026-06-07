import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@multi-stream-alerts/shared',
    '@multi-stream-alerts/database',
    '@multi-stream-alerts/ui',
  ],
  outputFileTracingIncludes: {
    '/dashboard/[channelSlug]/guide': ['../../docs/**/*'],
  },
};

export default nextConfig;
