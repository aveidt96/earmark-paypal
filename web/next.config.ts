import { resolve } from "node:path";
import type { NextConfig } from "next";

// Vercel Production is always the public PayPal experience. A local
// production build can still opt into the preserved workspace explicitly.
const publicDemoOnly =
  process.env.VERCEL_ENV === "production" ||
  (process.env.NODE_ENV === "production"
    ? process.env.NEXT_PUBLIC_DEMO_ONLY !== "false"
    : process.env.NEXT_PUBLIC_DEMO_ONLY === "true");

const privateCheckout =
  process.env.PAYPAL_TEST_HOSTING_PROFILE === "private-https";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_DEMO_ONLY: String(publicDemoOnly),
    EARMARK_PRIVATE_CHECKOUT_BUILD: privateCheckout ? "true" : "false",
  },
  webpack(config, { webpack }) {
    if (publicDemoOnly || privateCheckout) {
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
