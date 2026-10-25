import type { Metadata } from "next";
import { WorkspaceProvider } from "../components/workspace-provider";
import { Navigation, Notices } from "../components/navigation";
import { Brand } from "../components/glass";
import { ThemeProvider } from "../components/theme-provider";
import { themeBootstrap } from "../lib/theme";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.FLINT_WEB_ORIGIN ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL
        : "http://127.0.0.1:3000"),
  ),
  title: {
    default: "Earmark PayPal — Every payment has a purpose.",
    template: "%s | Earmark PayPal",
  },
  applicationName: "Earmark PayPal",
  description:
    "Purpose-bound authorization for autonomous AI agents. PayPal Sandbox integration preparation with preserved legacy security demonstrations. Payments are not integrated yet.",
  openGraph: {
    type: "website",
    siteName: "Earmark PayPal",
    title: "Earmark PayPal — Every payment has a purpose.",
    description:
      "Task-scoped spending authority for AI agents. PayPal Sandbox integration in preparation; original Earmark demonstrations preserved.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Earmark PayPal — Every payment has a purpose.",
  },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Static local theme bootstrap only; no user or request content is interpolated. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <div className="ambient-scene" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <ThemeProvider>
          <WorkspaceProvider>
            <a className="skip-link" href="#main">
              Skip to workspace
            </a>
            <div className="application">
              <Navigation />
              <p className="notice" role="status">
                Earmark PayPal · Sandbox integration preparation. PayPal
                payments are not implemented. Wallet actions and recorded
                payment evidence belong to the preserved legacy EVM application.
              </p>
              <Notices />
              {children}
              <footer className="workspace-footer">
                <Brand />
                <p>Purpose-bound payments for autonomous agents.</p>
                <span>
                  PayPal AI Hackathon · Sandbox integration in preparation.
                </span>
                <span>
                  The agent chooses. The mandate constrains. Delivery settles.
                </span>
                <span>
                  Legacy demonstration payments use local or testnet mock
                  assets. Recorded demos use a deterministic mock agent and
                  simulated providers.
                </span>
                <span>
                  Legacy workspace:{" "}
                  {process.env.NEXT_PUBLIC_CHAIN_ID === "10143"
                    ? "Monad Testnet"
                    : "Local Anvil"}{" "}
                  · Mock USDC · Simulated services
                </span>
              </footer>
            </div>
          </WorkspaceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
