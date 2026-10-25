"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { bytesToHex, zeroHash, type Hex } from "viem";
import { validateCreation, type CreationInput } from "../lib/forms";
import { useWorkspace } from "./workspace-provider";
import { useOwner, money } from "./dashboard";
import { Badge, Button, Empty, Icon, Modal, Panel, PanelTitle } from "./glass";
export function CreateMandate({ initialTask = "" }: { initialTask?: string }) {
  const w = useWorkspace(),
    owner = useOwner();
  const [description, setDescription] = useState(
      initialTask ||
        "Purchase a weather dataset from an approved provider for no more than 10 USDC.",
    ),
    [cap, setCap] = useState("10"),
    [expiry, setExpiry] = useState(""),
    [delivery, setDelivery] = useState("1"),
    [challenge, setChallenge] = useState("1"),
    [trustedHash, setTrustedHash] = useState(""),
    [providers, setProviders] = useState<string[]>(["datahub", "weatherco"]),
    [salt, setSalt] = useState<Hex>(zeroHash),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState<ReturnType<
      typeof validateCreation
    > | null>(null),
    [created, setCreated] = useState<Hex | null>(null);
  useEffect(() => {
    setSalt(bytesToHex(crypto.getRandomValues(new Uint8Array(32))));
    const d = new Date(Date.now() + 86400000);
    setExpiry(
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  }, []);
  const review = () => {
    setError("");
    try {
      const config = w.snapshot.config;
      if (!config || !w.snapshot.owner || !w.snapshot.balance)
        throw new Error("Wait for the configured vault state.");
      const input: CreationInput = {
        description,
        salt,
        agent: config.agent,
        token: config.token,
        cap,
        expiry: Math.floor(new Date(expiry).getTime() / 1000),
        providers: config.providers
          .filter((p) => providers.includes(p.id))
          .map((p) => p.address),
        deliveryWindow: Number(delivery) * 3600,
        challengeWindow: Number(challenge) * 3600,
        trustedHash: trustedHash.trim() || zeroHash,
      };
      setConfirmation(
        validateCreation(input, {
          ...config,
          owner: w.snapshot.owner,
          decimals: w.snapshot.balance.decimals,
          providers: config.providers.map((p) => p.address),
          now: w.snapshot.chainTime,
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error && e.message.length < 240
          ? e.message
          : "Check the budget, providers, deadlines and expected hash. Durations must be 1–720 whole hours.",
      );
    }
  };
  const confirm = async () => {
    if (!confirmation) return;
    const result = await w.perform(async () => {
      const receipt = await w.ownerWallet().create(confirmation);
      await w.post("register", {
        mandateId: confirmation.taskHash,
        description: confirmation.description,
        salt: confirmation.salt,
        transactionHash: receipt.transactionHash,
      });
      return confirmation.taskHash;
    }, "Earmark confirmed and task registered");
    if (result) {
      setCreated(result);
      localStorage.setItem("flint-mandate", result);
      setConfirmation(null);
    }
  };
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <span className="eyebrow">OWNER CONTROLLED AUTHORIZATION</span>
          <h1>Create an Earmark</h1>
          <p>
            Give your agent a precise permission envelope. Every term is
            immutable.
          </p>
        </div>
        <Link className="text-action" href="/">
          Back to workspace <Icon name="arrow" />
        </Link>
      </div>
      {created ? (
        <Panel>
          <div className="success-callout">
            <Badge tone="success">Transaction confirmed</Badge>
            <h2>Your earmark is ready.</h2>
            <p className="hash">{created}</p>
          </div>
          <p className="muted">
            No funds were reserved by creation. Fund the vault and launch your
            task when ready.
          </p>
          <Link className="button primary" href="/#compose">
            Open workspace <Icon name="arrow" />
          </Link>
        </Panel>
      ) : (
        <Panel>
          <PanelTitle icon="shield">Define the task’s authority</PanelTitle>
          {!w.snapshot.config ? (
            <Empty>
              Start the local workspace to configure a real vault. No example
              addresses are used.
            </Empty>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
            >
              <div className="form-grid">
                <label className="field span-two">
                  Task description
                  <textarea
                    required
                    minLength={12}
                    maxLength={1000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </label>
                <label className="field">
                  Authorized agent
                  <input value={w.snapshot.config.agent} readOnly />
                  <span className="micro">
                    Existing designated burner wallet. Separate from the owner.
                  </span>
                </label>
                <label className="field">
                  Approved payment token
                  <input value={w.snapshot.config.token} readOnly />
                  <span className="micro">
                    Conventional mock USDC · {w.snapshot.balance?.decimals ?? 6}{" "}
                    decimals.
                  </span>
                </label>
                <label className="field">
                  Task cap (mock USDC)
                  <input
                    required
                    inputMode="decimal"
                    value={cap}
                    onChange={(e) => setCap(e.target.value)}
                  />
                </label>
                <label className="field">
                  Earmark expiry
                  <input
                    required
                    type="datetime-local"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                </label>
                <div className="field span-two">
                  <span>Approved providers</span>
                  <div className="checkbox-group">
                    {w.snapshot.config.providers.map((p) => (
                      <label key={p.id} className="checkbox-card">
                        <input
                          type="checkbox"
                          checked={providers.includes(p.id)}
                          onChange={(e) =>
                            setProviders((list) =>
                              e.target.checked
                                ? [...list, p.id]
                                : list.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>
                          {p.name}
                          <small>{p.address}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <hr className="form-divider" />
                <label className="field">
                  Delivery duration (hours)
                  <input
                    required
                    type="number"
                    min="1"
                    max="720"
                    step="1"
                    value={delivery}
                    onChange={(e) => setDelivery(e.target.value)}
                  />
                </label>
                <label className="field">
                  Owner challenge duration (hours)
                  <input
                    required
                    type="number"
                    min="1"
                    max="720"
                    step="1"
                    value={challenge}
                    onChange={(e) => setChallenge(e.target.value)}
                  />
                </label>
                <label className="field">
                  Acceptance window
                  <input readOnly value="48 hours · fixed by Earmark Vault" />
                  <span className="micro">
                    Begins after the delivery deadline, according to the funded
                    payment record.
                  </span>
                </label>
                <label className="field">
                  Owner-trusted expected hash (optional)
                  <input
                    value={trustedHash}
                    onChange={(e) => setTrustedHash(e.target.value)}
                    placeholder="0x… (32 bytes)"
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="info-callout">
                A earmark grants cumulative spending authority. It does not
                reserve the cap or guarantee available funding. The owner is the
                trusted dispute authority. Task hashes identify terms; they do
                not prove semantic task correctness.
              </div>
              {error && (
                <p role="alert" className="validation-error">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <p className="micro">
                  A versioned task hash binds this vault, description and a
                  fresh salt. Your wallet will confirm the immutable terms
                  onchain.
                </p>
                <Button type="submit" disabled={!owner || w.busy}>
                  Review earmark <Icon name="arrow" />
                </Button>
              </div>
              {!owner && (
                <p className="micro">
                  Connect the current owner wallet on{" "}
                  {w.snapshot.config?.network ?? "the configured network"} to
                  create a earmark.
                </p>
              )}
            </form>
          )}
        </Panel>
      )}
      {confirmation && (
        <Modal
          title="Confirm immutable earmark"
          onClose={() => setConfirmation(null)}
        >
          <h3>{confirmation.description}</h3>
          <dl className="value-list detailed">
            <div>
              <dt>Cumulative cap</dt>
              <dd>{money(String(confirmation.capUnits))} mock USDC</dd>
            </div>
            <div>
              <dt>Providers</dt>
              <dd>{confirmation.providers.length}</dd>
            </div>
            <div>
              <dt>Expiry</dt>
              <dd>{new Date(confirmation.expiry * 1000).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Delivery / acceptance / challenge</dt>
              <dd>
                {confirmation.deliveryWindow / 3600}h / 48h /{" "}
                {confirmation.challengeWindow / 3600}h
              </dd>
            </div>
            <div>
              <dt>Task ID</dt>
              <dd className="hash">{confirmation.taskHash}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd className="hash">{confirmation.agent}</dd>
            </div>
            <div>
              <dt>Token</dt>
              <dd className="hash">{confirmation.token}</dd>
            </div>
            <div>
              <dt>Trusted hash</dt>
              <dd className="hash">
                {confirmation.trustedHash === zeroHash
                  ? "Not configured"
                  : confirmation.trustedHash}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Creation grants authority and reserves no funds. These terms cannot
            be edited later.
          </p>
          <Button disabled={w.busy} onClick={() => void confirm()}>
            {w.busy ? "Waiting for confirmation…" : "Approve earmark in wallet"}
          </Button>
        </Modal>
      )}
    </main>
  );
}
