import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config, { webpack }) {
    if (process.env.NEXT_PUBLIC_DEMO_ONLY === "true") {
      // Exclude the legacy client graph before the App Router collects client references.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /(?:^|\/)legacy-web-profile$/,
          resolve(
            process.cwd(),
            "src/components/disabled-legacy-web-profile.ts",
          ),
        ),
      );
    }
    return config;
  },
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
