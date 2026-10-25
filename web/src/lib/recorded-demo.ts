import recording from "./demo/normal.json";
import type { WorkspaceSnapshot } from "./model";
export const normalRecording = recording;
export const normalSnapshot =
  recording.snapshot as unknown as WorkspaceSnapshot;
// Presentation only; this projection is never supplied to a wallet or agent tool.
export function normalFrame(frame: number): WorkspaceSnapshot {
  const s = structuredClone(normalSnapshot);
  const p = s.payments[0],
    m = s.mandates[0],
    run = s.runs[0];
  if (!p || !m || !run || frame >= 4) return s;
  const status = ["NONE", "FUNDED", "SUBMITTED", "ACCEPTED"][frame];
  const delivery = s.events.find(
    (e) => e.type === "provider.delivery.submitted",
  );
  const cut =
    frame <= 1
      ? p.fundedAt
      : frame === 2
        ? Math.floor((delivery?.observedAt ?? p.fundedAt * 1000) / 1000)
        : p.challengeDeadline - m.challengeWindow;
  s.chainTime = cut;
  s.events = s.events.filter(
    (e) => e.observedAt < (cut + 1) * 1000 && e.type !== "PaymentCompleted",
  );
  m.reserved = frame === 0 ? "0" : p.amount;
  m.settled = "0";
  m.remaining = String(BigInt(m.cap) - BigInt(m.reserved));
  s.balance = {
    actual: "20000000",
    available: frame === 0 ? "20000000" : "14000000",
    reserved: m.reserved,
    decimals: 6,
    symbol: "mock-USDC",
  };
  run.status = frame === 3 ? "awaiting-challenge" : "running";
  run.inspected = frame >= 2;
  if (status === "NONE") s.payments = [];
  else if (
    status === "FUNDED" ||
    status === "SUBMITTED" ||
    status === "ACCEPTED"
  ) {
    p.status = status;
    if (status !== "ACCEPTED") p.challengeDeadline = 0;
    if (status === "FUNDED")
      p.deliveredHash = ("0x" + "0".repeat(64)) as `0x${string}`;
    delete p.resolutionHash;
  }
  return s;
}
