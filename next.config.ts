import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Suppress hydration warnings for styled-jsx
  reactStrictMode: true,
};

export default nextConfig;
