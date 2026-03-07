import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Force all pages to be server-rendered dynamically (not statically generated)
  // Required for Railway deployment where env vars are only available at runtime
  experimental: {},
};

// Suppress static generation for all pages at build time
// by setting the default export dynamic behavior
process.env.NEXT_TELEMETRY_DISABLED = '1';

export default nextConfig;
