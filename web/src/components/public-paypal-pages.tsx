"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./glass";
import { PayPalResearchConsole } from "./paypal-agent-console";
import { RecordedPayPalCard } from "./recorded-paypal-card";
import { ThemeSelector, useTheme } from "./theme-provider";

const links = [
  ["Checkout", "/"],
  ["Mandates", "/mandates"],
  ["Policies", "/security"],
  ["Activity", "/activity"],
  ["Purchases", "/payments"],
] as const;

export function PublicPayPalNavigation() {
  const pathname = usePathname();
  const { preference } = useTheme();
  return (
    <header className="floating-nav">
      <Link href="/" aria-label="Earmark PayPal home">
        {preference === "norway" ? (
          <span className="norway-brand">
            <Brand compact priority imageSizes="32px" />
            Earmark
          </span>
        ) : (
          <Brand priority />
        )}
      </Link>
      <nav className="nav-links" aria-label="Main navigation">
        {links.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : undefined}
          >
            {preference === "norway" && <NorwayNavIcon href={href} />}
            {label}
          </Link>
        ))}
      </nav>
      <div className="nav-actions">
        <ThemeSelector />
      </div>
      {preference === "norway" && (
        <div className="norway-sandbox">
          <span>SANDBOX</span>
          <p>Research merchant offers. Payment execution is disabled.</p>
        </div>
      )}
    </header>
  );
}

export function PublicPayPalHome() {
  return (
    <main id="main" className="operational-workspace public-paypal-home">
      <PayPalResearchConsole />
    </main>
  );
}

const receiptPages = {
  mandate: ["Mandates", "Recorded Sandbox spending limits and accounting."],
  payment: ["Purchases", "Historical PayPal Sandbox payment evidence."],
  activity: [
    "Activity",
    "Recorded authorization, approval and capture stages.",
  ],
} as const;

export function PublicPayPalReceiptPage({
  view,
}: {
  view: keyof typeof receiptPages;
}) {
  const [title, description] = receiptPages[view];
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <RecordedPayPalCard view={view} />
    </main>
  );
}

export function NorwayNavIcon({ href }: { href: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {href === "/activity" ? (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l3 2" />
        </>
      ) : (
        <path
          d={
            href === "/"
              ? "M3 4h14v9H8l-4 3v-3H3z"
              : href === "/mandates"
                ? "M10 2l6 2v5c0 4-3 7-6 9-3-2-6-5-6-9V4z"
                : href === "/security"
                  ? "M4 5h12M4 10h12M4 15h8"
                  : "M3 4h14v13H3zM6 8h8M6 12h5"
          }
        />
      )}
    </svg>
  );
}
