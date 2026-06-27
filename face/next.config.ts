import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this app dir (repo has multiple lockfiles).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
