import type { PaymentRecord, RecordedEvent, RunView } from "./model";
export const paymentStages = [
  "Requested",
  "Earmarked",
  "Delivered",
  "Accepted",
  "Settled",
] as const;
export function paymentProgress(
  run: RunView | undefined,
  p: PaymentRecord | undefined,
  events: RecordedEvent[],
) {
  if (p?.status === "COMPLETED") return 4;
  if (p?.status === "ACCEPTED") return 3;
  if (p?.status === "SUBMITTED") return 2;
  if (p?.status === "FUNDED") return 1;
  if (p?.status === "REJECTED" || p?.status === "EXPIRED")
    return p.challengeDeadline > 0
      ? 3
      : p.deliveredHash !== "0x" + "0".repeat(64)
        ? 2
        : 1;
  return run &&
    events.some((e) => e.runId === run.id && e.type === "payment.requested")
    ? 0
    : -1;
}
