import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The agent route needs the Node.js runtime (Anthropic SDK + Postgres driver).
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
