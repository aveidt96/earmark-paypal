"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand, Panel } from "./glass";
import { PayPalResearchConsole } from "./paypal-agent-console";
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

const statusPages = {
  mandate: [
    "Mandates",
    "Your research budget compares offers. It does not authorize spending.",
  ],
  payment: [
    "Purchases",
    "Payment execution is disabled. Any purchase takes place on the official merchant site.",
  ],
  activity: [
    "Activity",
    "Research and manual checkout selections stay in this session. They do not create payment records.",
  ],
  policy: [
    "Policies",
    "Each offer is checked against source evidence and your research budget. Discovered merchants cannot be paid through Earmark.",
  ],
} as const;

export function PublicPayPalStatusPage({
  view,
}: {
  view: keyof typeof statusPages;
}) {
  const [title, description] = statusPages[view];
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <Panel>
        <p>{description}</p>
        <Link href="/">Back to merchant research</Link>
      </Panel>
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
