import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: resolve(process.cwd(), ".."),
  outputFileTracingIncludes: {
    "/api/workspace": ["../agent/dist/**/*", "../agent/package.json"],
    "/api/workspace/*": ["../agent/dist/**/*", "../agent/package.json"],
  },
  serverExternalPackages: ["@flint/agent", "viem"],
  // Generated local state and secret files are never deployment inputs.
  outputFileTracingExcludes: {
    "*": [
      "**/.tools/**",
      "**/.agent-state/**",
      "**/.env*",
      "**/*.key",
      "**/*.pem",
      "**/contracts/out/**",
      "**/contracts/cache/**",
      "**/contracts/lib/**",
      "**/agent/test/**",
      "**/web/test/**",
      "**/e2e/**",
    ],
  },
};

export default nextConfig;
