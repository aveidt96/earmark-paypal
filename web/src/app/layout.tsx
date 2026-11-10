import type { Metadata } from "next";
import { PublicPayPalNavigation } from "../components/public-paypal-pages";
import { Brand } from "../components/glass";
import { ThemeProvider } from "../components/theme-provider";
import { themeBootstrap } from "../lib/theme";
import "./globals.css";
import "./norway.css";
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
    "Purpose-bound authorization for AI agents, with a separate controlled buyer-approved Sandbox checkout and preserved legacy security demonstrations.",
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
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const legacy =
    process.env.NEXT_PUBLIC_DEMO_ONLY === "true"
      ? null
      : await import("../components/legacy-web-profile");
  const WorkspaceProvider = legacy?.WorkspaceProvider;
  const Navigation = legacy?.Navigation;
  const Notices = legacy?.Notices;
  const content = (
    <>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <div className="application">
        {Navigation ? <Navigation /> : <PublicPayPalNavigation />}
        <p
          className="notice workspace-mode-notice"
          data-public-demo={process.env.NEXT_PUBLIC_DEMO_ONLY === "true"}
          role="status"
        >
          {process.env.NEXT_PUBLIC_DEMO_ONLY === "true" ? (
            <>
              <span className="classic-label">
                Earmark PayPal · Merchant research and budget review. Payment
                execution is disabled.
              </span>
              <span className="norway-label">
                Merchant research · Budget review · Payments disabled.
              </span>
            </>
          ) : (
            "Earmark PayPal · Controlled, buyer-approved Sandbox checkout is isolated at /paypal-test. Main-workspace wallet actions and recorded payment evidence belong to the preserved legacy EVM application."
          )}
        </p>
        {Notices && <Notices />}
        {children}
        <footer className="workspace-footer">
          <Brand />
          <p>Purpose-bound payments for autonomous agents.</p>
          <span>PayPal AI Hackathon · Sandbox integration in preparation.</span>
          <span>
            The agent chooses. The mandate constrains. Delivery settles.
          </span>
          {legacy && (
            <>
              <span>
                Legacy demonstration payments use local or testnet mock assets.
                Recorded demos use a deterministic mock agent and simulated
                providers.
              </span>
              <span>
                Legacy workspace:{" "}
                {process.env.NEXT_PUBLIC_CHAIN_ID === "10143"
                  ? "Monad Testnet"
                  : "Local Anvil"}{" "}
                · Mock USDC · Simulated services
              </span>
            </>
          )}
        </footer>
      </div>
    </>
  );
  return (
    <html lang="en" data-theme="norway" suppressHydrationWarning>
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
          {WorkspaceProvider ? (
            <WorkspaceProvider>{content}</WorkspaceProvider>
          ) : (
            content
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
