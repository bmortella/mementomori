import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  outputFileTracingExcludes: { "*": ["./data/**"] },
};

export default nextConfig;
