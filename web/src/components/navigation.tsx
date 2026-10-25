"use client";
import Link from "next/link";
import { ThemeSelector } from "./theme-provider";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand, Icon, Button, Modal, Badge } from "./glass";
import { useWorkspace } from "./workspace-provider";
import { short } from "../lib/model";
import { switchLocal } from "../lib/wallet";
export function Navigation() {
  const path = usePathname();
  const w = useWorkspace();
  const [modal, setModal] = useState<"wallet" | "network" | null>(null);
  const network =
    w.snapshot.config?.network ??
    (process.env.NEXT_PUBLIC_CHAIN_ID === "10143"
      ? "Monad Testnet"
      : "Local Anvil");
  const correct = w.wallet?.chainId === w.snapshot.config?.chainId;
  return (
    <>
      <header className="floating-nav">
        <Link href="/" aria-label="Earmark PayPal home">
          <Brand priority />
        </Link>
        <nav className="nav-links" aria-label="Main navigation">
          {[
            ["Workspace", "/"],
            ["Earmarks", "/mandates"],
            ["Payments", "/payments"],
            ["Live Activity", "/activity"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href ?? "/"}
              className={
                path === href ||
                (href !== "/" && path.startsWith(href ?? "never"))
                  ? "active"
                  : ""
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="nav-actions">
          <ThemeSelector />
          <button
            type="button"
            className="nav-pill network-pill"
            onClick={() => setModal("network")}
          >
            <Icon name="globe" />
            {network}
            <Icon name="chevron" />
          </button>
          <button
            type="button"
            className={`nav-pill wallet-pill ${w.wallet && !correct ? "wrong-chain" : ""}`}
            onClick={() => setModal("wallet")}
          >
            <span
              className={`wallet-dot ${w.wallet ? (correct ? "connected" : "wrong") : ""}`}
            />
            {w.wallet ? short(w.wallet.account) : "Connect wallet"}
          </button>
          <Link className="button soft launch-link" href="/#compose">
            Run Agent <Icon name="arrow" />
          </Link>
        </div>
      </header>
      {modal === "wallet" && (
        <Modal
          title={w.wallet ? "Your wallet" : "Connect your wallet"}
          onClose={() => setModal(null)}
        >
          {w.wallet ? (
            <>
              <Badge tone={correct ? "success" : "warning"}>
                {correct ? "Connected to " + network : "Wrong network"}
              </Badge>
              <p className="hash">{w.wallet.account}</p>
              <p className="muted">
                {w.wallet.account.toLowerCase() ===
                w.snapshot.owner?.toLowerCase()
                  ? "Current vault owner"
                  : "Connected account is not the vault owner"}
              </p>
              {!correct && w.snapshot.config && (
                <Button
                  onClick={() =>
                    void w.perform(async () => {
                      await switchLocal(
                        w.ownerWallet().provider,
                        w.ownerWallet().config,
                      );
                    }, "Network switched")
                  }
                >
                  Switch to {network}
                </Button>
              )}
              <Button
                variant="soft"
                onClick={() => {
                  w.disconnect();
                  setModal(null);
                }}
              >
                Disconnect workspace
              </Button>
            </>
          ) : (
            <>
              <p className="muted">
                Use your owner wallet. The agent signs with a separate
                server-side burner.
              </p>
              {w.choices.length ? (
                w.choices.map((c) => (
                  <Button
                    variant="soft"
                    className="wallet-choice"
                    key={c.id}
                    onClick={() =>
                      void w.connect(c.id).then(() => setModal(null))
                    }
                  >
                    <Icon name="wallet" />
                    {c.name}
                    <Icon name="arrow" />
                  </Button>
                ))
              ) : (
                <p className="empty-state">
                  No injected wallet found. Enable MetaMask or Rabby, then
                  refresh.
                </p>
              )}
            </>
          )}
        </Modal>
      )}
      {modal === "network" && (
        <Modal title="Workspace network" onClose={() => setModal(null)}>
          <div className="network-option">
            <Icon name="globe" />
            <strong>{network}</strong>
            <Badge>Test assets only</Badge>
          </div>
          <p className="muted">
            Chain{" "}
            {w.snapshot.config?.chainId ??
              (network === "Monad Testnet" ? 10143 : 31337)}{" "}
            · Mock USDC · No real funds
          </p>
        </Modal>
      )}
    </>
  );
}
export function Notices() {
  const { notice, notify, offline, loading, snapshot, wallet } = useWorkspace();
  return (
    <div className="notice-area">
      {loading && wallet && (
        <p className="notice" role="status">
          Connecting to your workspace…
        </p>
      )}
      {offline && wallet && (
        <p className="notice pending" role="status">
          {snapshot.error === "HISTORY_SYNCING"
            ? "Synchronizing confirmed contract history. Financial actions remain disabled until current."
            : snapshot.error === "WORKER_STARTING" ||
                snapshot.error === "SERVICE_RESTARTING"
              ? "Backend starting or restarting. Financial actions remain disabled until ready."
              : snapshot.error === "BACKEND_WAKING_OR_UNAVAILABLE"
                ? "Backend waking up or unavailable. Retrying safely; financial actions are disabled."
                : "Connection interrupted. Showing last observed state; financial actions are disabled."}
        </p>
      )}
      {wallet && !loading && !offline && !snapshot.configured && (
        <p className="notice">
          {snapshot.error === "WORKSPACE_NOT_CONFIGURED"
            ? "Your local vault is not connected yet. Start the local workspace to begin."
            : `Workspace unavailable: ${snapshot.error ?? "configuration needs review"}`}
        </p>
      )}
      {notice && (
        <div
          className={`notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <Icon
            name={
              notice.kind === "error"
                ? "info"
                : notice.kind === "success"
                  ? "check"
                  : "clock"
            }
          />
          <span>
            {notice.message}
            {notice.hash && <code className="hash">{notice.hash}</code>}
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => notify(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}
