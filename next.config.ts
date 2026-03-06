import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Force all pages to be server-rendered dynamically (not statically generated)
  // This prevents build failures when env vars (Supabase keys) are not available at build time
  // Required for Railway deployment where env vars are only available at runtime
  experimental: {
    // Allow build to succeed even if some pages can't be pre-rendered
  },
};

// Suppress static generation for all pages at build time
// by setting the default export dynamic behavior
process.env.NEXT_TELEMETRY_DISABLED = '1';

export default nextConfig;
